import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, itemScore, llmCall, sourceQuery, workspace } from "@/db/schema";
import { llmUsageSince } from "@/llm/usage";
import { getScanProgress, scanDone, startFirstScan } from "@/onboarding/scan";
import {
  getAccountSummary,
  markOwnPosts,
  saveAccount,
} from "@/workspace/accounts";
import {
  addHnKeyword,
  deleteQuery,
  listHnQueries,
  restoreQuery,
  setQueryEnabled,
  syncHnQueries,
} from "@/workspace/keywords";
import { getProductProfile, saveProductProfile } from "@/workspace/profile";
import { truncateAll } from "../helpers/truncate";

async function createWorkspace(name = "Test") {
  const [ws] = await db
    .insert(workspace)
    .values({ name })
    .returning({ id: workspace.id });
  return ws!.id;
}

const summary = (rows: { section: string; query: string }[]) =>
  rows.map((q) => `${q.section}:${q.query}`).sort();

describe("onboarding", () => {
  let ws: string;
  beforeEach(async () => {
    await truncateAll();
    ws = await createWorkspace();
  });

  it("saves and reads back the product profile", async () => {
    expect(await getProductProfile(db, ws)).toBeNull();
    await saveProductProfile(db, ws, {
      productName: "Greer",
      productDescription: "Finds conversations.",
      audience: "",
      problems: ["First customers"],
    });
    expect(await getProductProfile(db, ws)).toEqual({
      productName: "Greer",
      productDescription: "Finds conversations.",
      audience: "",
      problems: ["First customers"],
    });
  });

  it("stores the HN account and summarizes its maturity", async () => {
    await saveAccount(db, ws, "hn", {
      handle: "founder",
      createdAt: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000),
      karma: 212,
    });
    // Linking again updates the same row.
    await saveAccount(db, ws, "hn", {
      handle: "founder",
      createdAt: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000),
      karma: 250,
    });
    expect(await getAccountSummary(db, ws, "hn")).toMatchObject({
      handle: "founder",
      karma: 250,
      tier: "growing",
      repliesPerDay: 5,
    });
  });

  it("hides your own posts collected before you linked the account", async () => {
    const base = {
      workspaceId: ws,
      platform: "hn" as const,
      type: "story" as const,
      title: "t",
      text: "x",
      url: "u",
      threadId: "1",
      postedAt: new Date(),
      category: "help" as const,
      filterStatus: "kept" as const,
      matchedQueryIds: [],
      raw: {},
    };
    await db.insert(item).values([
      { ...base, externalId: "1", author: "Founder" },
      { ...base, externalId: "2", author: "someone" },
    ]);
    expect(await markOwnPosts(db, ws, "hn", "founder")).toBe(1);
    const rows = await db
      .select({ author: item.author, status: item.filterStatus })
      .from(item)
      .orderBy(item.externalId);
    expect(rows).toEqual([
      { author: "Founder", status: "own_post" },
      { author: "someone", status: "kept" },
    ]);
  });

  describe("syncHnQueries", () => {
    it("adds, keeps and removes queries to match the chosen list", async () => {
      await syncHnQueries(
        db,
        ws,
        [
          { query: "customers", section: "ask_hn" },
          { query: "first users", section: "story_comment" },
        ],
        true,
      );
      const first = await listHnQueries(db, ws);
      expect(summary(first)).toEqual([
        "ask_hn:customers",
        "show_hn:",
        "story_comment:first users",
      ]);

      const ids = await syncHnQueries(
        db,
        ws,
        [
          { query: "customers", section: "ask_hn" },
          { query: "marketing", section: "ask_hn" },
        ],
        false,
      );
      const second = await listHnQueries(db, ws);
      expect(summary(second)).toEqual(["ask_hn:customers", "ask_hn:marketing"]);
      // The kept query is the same row, so its poll history survives.
      const kept = first.find((q) => q.query === "customers")!;
      expect(second.find((q) => q.query === "customers")!.id).toBe(kept.id);
      expect(ids.sort()).toEqual(second.map((q) => q.id).sort());
    });

    it("is idempotent", async () => {
      const keywords = [{ query: "launch", section: "ask_hn" as const }];
      await syncHnQueries(db, ws, keywords, true);
      await syncHnQueries(db, ws, keywords, true);
      expect(await listHnQueries(db, ws)).toHaveLength(2);
    });
  });

  it("starts the first scan once and returns enabled queries", async () => {
    const ids = await startFirstScan(db, ws, {
      keywords: [{ query: "customers", section: "ask_hn" }],
      showHn: false,
    });
    expect(ids).toHaveLength(1);
    const [row] = await db
      .select({ onboardedAt: workspace.onboardedAt })
      .from(workspace)
      .where(eq(workspace.id, ws));
    expect(row!.onboardedAt).toBeInstanceOf(Date);

    // Coming back to step 2 later keeps the original date.
    await startFirstScan(
      db,
      ws,
      { keywords: [], showHn: true },
      new Date("2030-01-01"),
    );
    const [again] = await db
      .select({ onboardedAt: workspace.onboardedAt })
      .from(workspace)
      .where(eq(workspace.id, ws));
    expect(again!.onboardedAt).toEqual(row!.onboardedAt);
  });

  it("reports scan progress and the best threads", async () => {
    const [queryId] = await startFirstScan(db, ws, {
      keywords: [{ query: "customers", section: "ask_hn" }],
      showHn: false,
    });
    let progress = await getScanProgress(db, ws);
    expect(progress.queries).toEqual({ total: 1, finished: 0, failed: 0 });
    expect(scanDone(progress)).toBe(false);

    await db
      .update(sourceQuery)
      .set({ lastPolledAt: new Date() })
      .where(eq(sourceQuery.id, queryId!));
    const base = {
      workspaceId: ws,
      platform: "hn" as const,
      type: "story" as const,
      author: "a",
      text: "t",
      threadId: "1",
      postedAt: new Date(),
      category: "help" as const,
      matchedQueryIds: [queryId!],
      raw: {},
    };
    const items = await db
      .insert(item)
      .values([
        {
          ...base,
          externalId: "1",
          title: "Low",
          url: "u1",
          filterStatus: "kept",
        },
        {
          ...base,
          externalId: "2",
          title: "High",
          url: "u2",
          filterStatus: "kept",
        },
        {
          ...base,
          externalId: "3",
          title: "Short",
          url: "u3",
          filterStatus: "too_short",
        },
      ])
      .returning({ id: item.id, title: item.title });
    const score = (itemId: string, value: number) => ({
      itemId,
      workspaceId: ws,
      score: value,
      criteriaMet: 3,
      criteriaTotal: 5,
      criteria: {},
      intent: "asking_for_help",
      reason: "r",
      promptVersion: "v",
      model: "claude-haiku-4-5",
    });
    await db.insert(itemScore).values(score(items[1]!.id, 90));

    progress = await getScanProgress(db, ws);
    expect(progress).toMatchObject({ found: 3, kept: 2, scored: 1, people: 1 });
    expect(progress.top.map((t) => t.title)).toEqual(["High"]);
    expect(scanDone(progress)).toBe(false);

    // Below MIN_SCORE: done, but not someone to help.
    await db.insert(itemScore).values(score(items[0]!.id, 40));
    progress = await getScanProgress(db, ws);
    expect(progress.top.map((t) => t.title)).toEqual(["High"]);
    expect(scanDone(progress)).toBe(true);

    // People are distinct authors: "a" again doesn't count twice.
    const more = await db
      .insert(item)
      .values([
        {
          ...base,
          externalId: "4",
          title: "Also a",
          url: "u4",
          filterStatus: "kept",
        },
        {
          ...base,
          externalId: "5",
          author: "b",
          title: "From b",
          url: "u5",
          filterStatus: "kept",
        },
      ])
      .returning({ id: item.id });
    await db
      .insert(itemScore)
      .values([score(more[0]!.id, 60), score(more[1]!.id, 70)]);
    progress = await getScanProgress(db, ws);
    expect(progress.people).toBe(2);
    expect(progress.top.map((t) => t.title)).toEqual([
      "High",
      "From b",
      "Also a",
    ]);
  });

  it("keeps keywords scoped to their workspace", async () => {
    const other = await createWorkspace("Other");
    const row = await addHnKeyword(db, ws, {
      query: "launch",
      section: "ask_hn",
    });
    if (row === "duplicate") throw new Error("unexpected duplicate");
    expect(
      await addHnKeyword(db, ws, { query: "launch", section: "ask_hn" }),
    ).toBe("duplicate");

    expect(await setQueryEnabled(db, other, row.id, false)).toBe(false);
    expect(await deleteQuery(db, other, row.id)).toBeNull();
    expect(await listHnQueries(db, ws)).toHaveLength(1);
    expect(await listHnQueries(db, other)).toHaveLength(0);
  });

  it("restores a deleted keyword with the same id", async () => {
    const row = await addHnKeyword(db, ws, {
      query: "launch",
      section: "ask_hn",
    });
    if (row === "duplicate") throw new Error("unexpected duplicate");
    const deleted = await deleteQuery(db, ws, row.id);
    expect(await listHnQueries(db, ws)).toHaveLength(0);
    await restoreQuery(db, ws, { ...deleted!, enabled: false });
    const [restored] = await listHnQueries(db, ws);
    expect(restored).toMatchObject({
      id: row.id,
      query: "launch",
      label: "launch",
      enabled: false,
    });
  });

  it("leaves the cost unknown when a model has no price", async () => {
    await db.insert(llmCall).values({
      workspaceId: ws,
      slot: "fast",
      provider: "ollama",
      model: "llama3",
      promptName: "score-help",
      promptVersion: "v",
      inputTokens: 10,
      outputTokens: 10,
      durationMs: 1,
      ok: true,
    });
    expect(await llmUsageSince(db, ws, new Date(0))).toEqual({
      calls: 1,
      costUsd: null,
    });
  });
});
