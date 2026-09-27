import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, platformAccount, sourceQuery, workspace } from "@/db/schema";
import { BACKFILL_DAYS, enabledQueryIds, pollQuery } from "@/ingest/poll";
import type { RawItem, Source, SourceQuery } from "@/sources/types";
import { truncateAll } from "../helpers/truncate";

const body =
  "I launched my SaaS a month ago and still have zero paying customers. What should I try next?";

function raw(id: string, overrides: Partial<RawItem> = {}): RawItem {
  return {
    externalId: id,
    type: "story",
    author: "founder",
    title: `Ask HN: post ${id}`,
    text: body,
    url: `https://news.ycombinator.com/item?id=${id}`,
    threadId: id,
    createdAt: new Date("2026-09-26T10:00:00Z"),
    raw: { id },
    ...overrides,
  };
}

// A source that returns a fixed list and records what it was asked.
function fakeSource(items: RawItem[] | (() => never)) {
  const calls: { query: SourceQuery; since: Date }[] = [];
  const source: Source = {
    platform: "hn",
    async fetchNew(query, since) {
      calls.push({ query, since });
      return typeof items === "function" ? items() : items;
    },
    fetchThread: async () => {
      throw new Error("unused");
    },
    permalink: (id) => id,
  };
  return { sourceFor: () => source, calls };
}

async function createWorkspace(name = "Test") {
  const [ws] = await db
    .insert(workspace)
    .values({ name })
    .returning({ id: workspace.id });
  return ws!.id;
}

async function createQuery(workspaceId: string, label = "customers") {
  const [q] = await db
    .insert(sourceQuery)
    .values({
      workspaceId,
      platform: "hn",
      label,
      query: label,
      section: "ask_hn",
    })
    .returning({ id: sourceQuery.id });
  return q!.id;
}

const now = new Date("2026-09-27T12:00:00Z");

describe("pollQuery", () => {
  let workspaceId: string;
  beforeEach(async () => {
    await truncateAll();
    workspaceId = await createWorkspace();
  });

  it("stores new items, and a second identical poll adds nothing (idempotent)", async () => {
    const queryId = await createQuery(workspaceId);
    const { sourceFor } = fakeSource([raw("1"), raw("2"), raw("2")]);

    expect(await pollQuery(db, sourceFor, queryId, now)).toEqual({
      fetched: 3,
      new: 2,
      kept: 2,
    });
    expect(await pollQuery(db, sourceFor, queryId, now)).toEqual({
      fetched: 3,
      new: 0,
      kept: 0,
    });
    expect(await db.select().from(item)).toHaveLength(2);
  });

  it("backfills 7 days on the first poll, then continues from the last one with an overlap", async () => {
    const queryId = await createQuery(workspaceId);
    const { sourceFor, calls } = fakeSource([]);

    await pollQuery(db, sourceFor, queryId, now);
    expect(now.getTime() - calls[0]!.since.getTime()).toBe(
      BACKFILL_DAYS * 86_400_000,
    );

    const later = new Date(now.getTime() + 15 * 60_000);
    await pollQuery(db, sourceFor, queryId, later);
    expect(calls[1]!.since.getTime()).toBe(now.getTime() - 60 * 60_000);
  });

  it("records every query that found an item", async () => {
    const q1 = await createQuery(workspaceId, "customers");
    const q2 = await createQuery(workspaceId, "marketing");
    const { sourceFor } = fakeSource([raw("1")]);

    await pollQuery(db, sourceFor, q1, now);
    await pollQuery(db, sourceFor, q2, now);
    const [row] = await db.select().from(item);
    expect(row!.matchedQueryIds.sort()).toEqual([q1, q2].sort());
  });

  it("applies the prefilter and categorizes launches", async () => {
    await db
      .insert(platformAccount)
      .values({ workspaceId, platform: "hn", handle: "me" });
    const queryId = await createQuery(workspaceId);
    const { sourceFor } = fakeSource([
      raw("keep"),
      raw("mine", { author: "Me" }),
      raw("short", { type: "comment", text: "+1" }),
      raw("launch", { title: "Show HN: my tool" }),
    ]);

    expect(await pollQuery(db, sourceFor, queryId, now)).toMatchObject({
      new: 4,
      kept: 2,
    });
    const rows = await db.select().from(item);
    const byId = Object.fromEntries(rows.map((r) => [r.externalId, r]));
    expect(byId.keep).toMatchObject({ filterStatus: "kept", category: "help" });
    expect(byId.mine!.filterStatus).toBe("own_post");
    expect(byId.short!.filterStatus).toBe("too_short");
    expect(byId.launch).toMatchObject({
      filterStatus: "kept",
      category: "feedback",
    });
  });

  it("keeps each workspace's items separate", async () => {
    const other = await createWorkspace("Other");
    const { sourceFor } = fakeSource([raw("1")]);
    await pollQuery(db, sourceFor, await createQuery(workspaceId), now);
    await pollQuery(db, sourceFor, await createQuery(other), now);

    const rows = await db.select().from(item);
    expect(rows.map((r) => r.workspaceId).sort()).toEqual(
      [workspaceId, other].sort(),
    );
  });

  it("records the error on the query and rethrows so the job retries", async () => {
    const queryId = await createQuery(workspaceId);
    const { sourceFor } = fakeSource(() => {
      throw new Error("HTTP 503 from hn.algolia.com");
    });

    await expect(pollQuery(db, sourceFor, queryId, now)).rejects.toThrow("503");
    const [q] = await db
      .select()
      .from(sourceQuery)
      .where(eq(sourceQuery.id, queryId));
    expect(q).toMatchObject({
      lastError: "HTTP 503 from hn.algolia.com",
      lastPolledAt: null,
    });
  });

  it("skips disabled queries", async () => {
    const queryId = await createQuery(workspaceId);
    await db
      .update(sourceQuery)
      .set({ enabled: false })
      .where(eq(sourceQuery.id, queryId));
    const { sourceFor, calls } = fakeSource([raw("1")]);

    expect(await pollQuery(db, sourceFor, queryId, now)).toEqual({
      fetched: 0,
      new: 0,
      kept: 0,
    });
    expect(calls).toHaveLength(0);
    expect(await enabledQueryIds(db)).toEqual([]);
  });
});
