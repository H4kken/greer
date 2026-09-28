import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, platformAccount, reply, workspace } from "@/db/schema";
import { pollReplies, REPLIES_BACKFILL_DAYS, replyStats } from "@/replies/poll";
import type { Source, UserComment } from "@/sources/types";
import { removeAccount, saveAccount } from "@/workspace/accounts";
import { truncateAll } from "../helpers/truncate";

const NOW = new Date("2026-09-28T12:00:00Z");

function comment(id: string, over: Partial<UserComment> = {}): UserComment {
  return {
    externalId: id,
    parentId: "100",
    threadId: "100",
    threadTitle: "Ask HN: Pricing my first SaaS?",
    text: "Try annual plans.",
    url: `https://news.ycombinator.com/item?id=${id}`,
    createdAt: new Date("2026-09-27T10:00:00Z"),
    raw: { id },
    ...over,
  };
}

// A source that returns fixed comments and records what it was asked.
function fakeSource(comments: UserComment[]) {
  const calls: { handle: string; since: Date }[] = [];
  const source: Source = {
    platform: "hn",
    fetchNew: async () => [],
    fetchThread: async () => {
      throw new Error("unused");
    },
    permalink: (id) => id,
    async fetchUserComments(handle, since) {
      calls.push({ handle, since });
      return comments;
    },
  };
  return { sourceFor: () => source, calls };
}

async function setup(handle = "mathisg") {
  const [ws] = await db
    .insert(workspace)
    .values({ name: "Test" })
    .returning({ id: workspace.id });
  await saveAccount(db, ws!.id, "hn", {
    handle,
    createdAt: new Date("2020-01-01T00:00:00Z"),
    karma: 212,
  });
  return ws!.id;
}

async function addItem(workspaceId: string, externalId: string) {
  const [row] = await db
    .insert(item)
    .values({
      workspaceId,
      platform: "hn",
      externalId,
      type: "story",
      author: "founder",
      title: "Ask HN: Pricing my first SaaS?",
      text: "How should I price it?",
      url: `https://news.ycombinator.com/item?id=${externalId}`,
      threadId: externalId,
      postedAt: new Date("2026-09-27T09:00:00Z"),
      category: "help",
      filterStatus: "kept",
      matchedQueryIds: [],
      raw: {},
    })
    .returning({ id: item.id });
  return row!.id;
}

const repliesOf = (workspaceId: string) =>
  db.select().from(reply).where(eq(reply.workspaceId, workspaceId));

describe("pollReplies", () => {
  beforeEach(truncateAll);

  it("looks back a month the first time, then from the last check", async () => {
    const ws = await setup();
    const { sourceFor, calls } = fakeSource([comment("1"), comment("2")]);

    expect(await pollReplies(db, sourceFor, ws, "hn", NOW)).toMatchObject({
      fetched: 2,
      new: 2,
    });
    expect(calls[0]).toEqual({
      handle: "mathisg",
      since: new Date(NOW.getTime() - REPLIES_BACKFILL_DAYS * 86_400_000),
    });

    // Running again stores nothing twice and starts from the last check,
    // with an hour of overlap.
    const later = new Date(NOW.getTime() + 15 * 60_000);
    expect(await pollReplies(db, sourceFor, ws, "hn", later)).toMatchObject({
      fetched: 2,
      new: 0,
    });
    expect(calls[1]!.since).toEqual(new Date(NOW.getTime() - 3_600_000));
    expect(await repliesOf(ws)).toHaveLength(2);
  });

  it("links replies to what Greer collected: the parent first, else the thread", async () => {
    const ws = await setup();
    const thread = await addItem(ws, "100");
    const parent = await addItem(ws, "200");
    const { sourceFor } = fakeSource([
      comment("1", { parentId: "200" }),
      comment("2", { parentId: "300" }),
      comment("3", { parentId: "400", threadId: "500" }),
    ]);
    await pollReplies(db, sourceFor, ws, "hn", NOW);

    const byId = Object.fromEntries(
      (await repliesOf(ws)).map((r) => [r.externalId, r.itemId]),
    );
    expect(byId).toEqual({ "1": parent, "2": thread, "3": null });

    // A thread found later gets linked on the next poll.
    const late = await addItem(ws, "500");
    await pollReplies(db, sourceFor, ws, "hn", NOW);
    expect(
      (await repliesOf(ws)).find((r) => r.externalId === "3")!.itemId,
    ).toBe(late);
  });

  it("does nothing without a linked account", async () => {
    const [ws] = await db
      .insert(workspace)
      .values({ name: "Test" })
      .returning({ id: workspace.id });
    const { sourceFor, calls } = fakeSource([comment("1")]);
    expect(await pollReplies(db, sourceFor, ws!.id, "hn", NOW)).toMatchObject({
      fetched: 0,
      new: 0,
    });
    expect(calls).toHaveLength(0);
  });

  it("forgets replies when the account is switched or removed", async () => {
    const ws = await setup("mathisg");
    const { sourceFor } = fakeSource([comment("1")]);
    await pollReplies(db, sourceFor, ws, "hn", NOW);

    // Refreshing the same handle keeps them.
    await saveAccount(db, ws, "hn", {
      handle: "mathisg",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      karma: 213,
    });
    expect(await repliesOf(ws)).toHaveLength(1);

    await saveAccount(db, ws, "hn", {
      handle: "someone_else",
      createdAt: new Date("2021-01-01T00:00:00Z"),
      karma: 5,
    });
    expect(await repliesOf(ws)).toHaveLength(0);
    const [account] = await db
      .select()
      .from(platformAccount)
      .where(eq(platformAccount.workspaceId, ws));
    expect(account!.repliesCheckedAt).toBeNull();

    await pollReplies(db, sourceFor, ws, "hn", NOW);
    await removeAccount(db, ws, "hn");
    expect(await repliesOf(ws)).toHaveLength(0);
  });

  it("reports how many replies were found and when", async () => {
    const ws = await setup();
    expect(await replyStats(db, ws, "hn")).toEqual({
      count: 0,
      checkedAt: null,
    });
    const { sourceFor } = fakeSource([comment("1"), comment("2")]);
    await pollReplies(db, sourceFor, ws, "hn", NOW);
    expect(await replyStats(db, ws, "hn")).toEqual({
      count: 2,
      checkedAt: NOW,
    });
  });

  it("keeps each workspace's replies apart", async () => {
    const a = await setup();
    const b = await setup();
    const { sourceFor } = fakeSource([comment("1")]);
    await pollReplies(db, sourceFor, a, "hn", NOW);
    expect(await repliesOf(a)).toHaveLength(1);
    expect(await repliesOf(b)).toHaveLength(0);
  });
});
