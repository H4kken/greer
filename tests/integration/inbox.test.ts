import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, itemScore, sourceQuery, workspace } from "@/db/schema";
import {
  inboxCounts,
  type InboxOptions,
  listInbox,
  MIN_SCORE,
  sourceHealth,
  unscoredCount,
} from "@/inbox/queries";
import {
  dismissItem,
  restoreItem,
  SNOOZE_MS,
  snoozeItem,
} from "@/inbox/triage";
import { truncateAll } from "../helpers/truncate";

const now = new Date("2026-09-27T12:00:00Z");
let ws: string;
let n = 0;

async function createWorkspace() {
  const [row] = await db
    .insert(workspace)
    .values({ name: "Test" })
    .returning({ id: workspace.id });
  return row!.id;
}

async function addItem(
  over: {
    score?: number | null;
    category?: "help" | "feedback";
    postedAt?: Date;
    filterStatus?: "kept" | "too_short";
    matchedQueryIds?: string[];
    workspaceId?: string;
  } = {},
) {
  n++;
  const workspaceId = over.workspaceId ?? ws;
  const [row] = await db
    .insert(item)
    .values({
      workspaceId,
      platform: "hn",
      externalId: String(n),
      type: "story",
      author: "a",
      title: `Item ${n}`,
      text: "text",
      url: `u${n}`,
      threadId: String(n),
      postedAt: over.postedAt ?? new Date(now.getTime() - n * 60_000),
      category: over.category ?? "help",
      filterStatus: over.filterStatus ?? "kept",
      matchedQueryIds: over.matchedQueryIds ?? [],
      raw: {},
    })
    .returning({ id: item.id });
  if (over.score !== null) {
    await db.insert(itemScore).values({
      itemId: row!.id,
      workspaceId,
      score: over.score ?? 80,
      criteriaMet: 4,
      criteriaTotal: 5,
      criteria: {},
      intent: "asking_for_help",
      reason: "r",
      promptVersion: "v",
      model: "m",
    });
  }
  return row!.id;
}

const opts = (o: Partial<InboxOptions> = {}): InboxOptions => ({
  view: "help",
  sort: "best",
  showLow: false,
  limit: 50,
  now,
  ...o,
});
const ids = async (o: Partial<InboxOptions> = {}) =>
  (await listInbox(db, ws, opts(o))).items.map((i) => i.id);

describe("inbox", () => {
  beforeEach(async () => {
    await truncateAll();
    ws = await createWorkspace();
  });

  it("lists scored, kept threads by score, then newest", async () => {
    const older = await addItem({
      score: 90,
      postedAt: new Date("2026-09-20"),
    });
    const newer = await addItem({
      score: 90,
      postedAt: new Date("2026-09-26"),
    });
    const top = await addItem({ score: 95 });
    await addItem({ score: null }); // not scored yet
    await addItem({ filterStatus: "too_short" });
    await addItem({ category: "feedback" });

    expect(await ids()).toEqual([top, newer, older]);
    expect(await ids({ sort: "newest" })).toEqual([top, newer, older]);
    expect(await ids({ view: "feedback" })).toHaveLength(1);
    expect(await unscoredCount(db, ws)).toBe(1);
  });

  it("hides lower matches unless asked, and counts them", async () => {
    const high = await addItem({ score: MIN_SCORE });
    const low = await addItem({ score: MIN_SCORE - 1 });
    expect(await ids()).toEqual([high]);
    expect(await ids({ showLow: true })).toEqual([high, low]);
    expect(await inboxCounts(db, ws, now)).toMatchObject({
      help: 1,
      helpLow: 1,
    });
  });

  it("filters by keyword and pages with hasMore", async () => {
    const [q] = await db
      .insert(sourceQuery)
      .values({
        workspaceId: ws,
        platform: "hn",
        label: "launch",
        query: "launch",
        section: "ask_hn",
      })
      .returning({ id: sourceQuery.id });
    const matched = await addItem({ matchedQueryIds: [q!.id] });
    await addItem();
    await addItem();
    expect(await ids({ queryId: q!.id })).toEqual([matched]);
    const page = await listInbox(db, ws, opts({ limit: 2 }));
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it("moves threads between views as they are triaged", async () => {
    const a = await addItem();
    const b = await addItem();
    const c = await addItem();

    expect(await dismissItem(db, ws, a, "news, not a person", now)).toBe(true);
    expect(await snoozeItem(db, ws, b, now)).toBe(true);
    expect(await ids()).toEqual([c]);
    expect(await ids({ view: "dismissed" })).toEqual([a]);
    expect(await ids({ view: "snoozed" })).toEqual([b]);
    expect(await inboxCounts(db, ws, now)).toMatchObject({
      help: 1,
      snoozed: 1,
      dismissed: 1,
    });

    // A snooze ends by itself.
    const later = new Date(now.getTime() + SNOOZE_MS + 1);
    expect(await ids({ now: later })).toEqual([b, c]);
    expect(await ids({ view: "snoozed", now: later })).toEqual([]);

    // Undo puts the thread back as new.
    expect(await restoreItem(db, ws, a)).toBe(true);
    expect(await ids()).toEqual([a, c]);
  });

  it("never touches another workspace's threads", async () => {
    const other = await createWorkspace();
    const theirs = await addItem({ workspaceId: other });
    expect(await dismissItem(db, ws, theirs)).toBe(false);
    expect(await snoozeItem(db, ws, theirs)).toBe(false);
    expect(await ids()).toEqual([]);
    expect((await listInbox(db, other, opts())).items).toHaveLength(1);
  });

  it("reports the last check and failing searches", async () => {
    await db.insert(sourceQuery).values([
      {
        workspaceId: ws,
        platform: "hn",
        label: "ok",
        query: "ok",
        section: "ask_hn",
        lastPolledAt: now,
      },
      {
        workspaceId: ws,
        platform: "hn",
        label: "bad",
        query: "bad",
        section: "ask_hn",
        lastError: "HTTP 503",
        lastErrorAt: now,
      },
      {
        workspaceId: ws,
        platform: "hn",
        label: "off",
        query: "off",
        section: "ask_hn",
        enabled: false,
        lastError: "old",
      },
    ]);
    const health = await sourceHealth(db, ws);
    expect(health.lastCheckAt).toEqual(now);
    expect(health.failing.map((f) => f.label)).toEqual(["bad"]);
  });
});
