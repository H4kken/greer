import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { item, reply, replyAnswer, workspace } from "@/db/schema";
import { listPeople, setTriedProduct } from "@/people/queries";
import { fillParentAuthors, MAX_AUTHOR_LOOKUPS } from "@/replies/authors";
import type { Source } from "@/sources/types";
import { saveAccount } from "@/workspace/accounts";
import { truncateAll } from "../helpers/truncate";

const NOW = new Date("2026-09-28T12:00:00Z");

// Authors by external id; a missing id is a deleted item.
function fakeSource(authors: Record<string, string>) {
  const calls: string[] = [];
  const source: Source = {
    platform: "hn",
    fetchNew: async () => [],
    fetchThread: async () => {
      throw new Error("unused");
    },
    permalink: (id) => id,
    async fetchAuthor(id) {
      calls.push(id);
      return authors[id] ?? null;
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

async function addReply(
  workspaceId: string,
  externalId: string,
  over: Partial<typeof reply.$inferInsert> = {},
) {
  const [row] = await db
    .insert(reply)
    .values({
      workspaceId,
      platform: "hn",
      externalId,
      parentExternalId: `p${externalId}`,
      threadExternalId: `t${externalId}`,
      threadTitle: `Thread ${externalId}`,
      text: "Try annual plans.",
      url: `https://news.ycombinator.com/item?id=${externalId}`,
      postedAt: NOW,
      raw: {},
      ...over,
    })
    .returning({ id: reply.id });
  return row!.id;
}

const authorOf = async (id: string) =>
  (await db.select().from(reply).where(eq(reply.id, id)))[0]!.parentAuthor;

describe("fillParentAuthors", () => {
  beforeEach(truncateAll);

  it("takes the author from collected items first, then asks the source once", async () => {
    const ws = await setup();
    await db.insert(item).values({
      workspaceId: ws,
      platform: "hn",
      externalId: "p1",
      type: "story",
      author: "sarahk",
      title: "Ask HN: Pricing?",
      text: "How should I price it?",
      url: "https://news.ycombinator.com/item?id=p1",
      threadId: "p1",
      postedAt: NOW,
      category: "help",
      filterStatus: "kept",
      matchedQueryIds: [],
      raw: {},
    });
    const known = await addReply(ws, "1");
    const fetched = await addReply(ws, "2");
    const gone = await addReply(ws, "3");
    const { sourceFor, calls } = fakeSource({ p2: "tomw" });

    expect(await fillParentAuthors(db, sourceFor, ws, "hn")).toEqual({
      fromItems: 1,
      looked: 2,
    });
    expect(await authorOf(known)).toBe("sarahk");
    expect(await authorOf(fetched)).toBe("tomw");
    expect(await authorOf(gone)).toBe(""); // deleted: never asked again
    expect(calls.sort()).toEqual(["p2", "p3"]);

    await fillParentAuthors(db, sourceFor, ws, "hn");
    expect(calls).toHaveLength(2);
  });

  it(`looks up at most ${MAX_AUTHOR_LOOKUPS} per poll`, async () => {
    const ws = await setup();
    for (let i = 0; i < MAX_AUTHOR_LOOKUPS + 5; i++) await addReply(ws, `${i}`);
    const { sourceFor, calls } = fakeSource({});
    await fillParentAuthors(db, sourceFor, ws, "hn");
    expect(calls).toHaveLength(MAX_AUTHOR_LOOKUPS);
  });
});

describe("listPeople", () => {
  beforeEach(truncateAll);

  it("needs a linked account", async () => {
    const [ws] = await db
      .insert(workspace)
      .values({ name: "Test" })
      .returning({ id: workspace.id });
    expect(await listPeople(db, ws!.id, "hn")).toEqual({
      me: null,
      people: [],
      topics: [],
    });
  });

  it("builds people from replies, answers and marks, per workspace", async () => {
    const ws = await setup();
    const other = await setup("someone");
    const r1 = await addReply(ws, "1", { parentAuthor: "sarahk" });
    await addReply(ws, "2", { parentAuthor: "tomw" });
    await addReply(other, "3", { parentAuthor: "elsewhere" });
    await db.insert(replyAnswer).values({
      workspaceId: ws,
      replyId: r1,
      platform: "hn",
      externalId: "a1",
      author: "sarahk",
      text: "Thanks, trying it tonight!",
      url: "https://news.ycombinator.com/item?id=a1",
      postedAt: NOW,
      tone: "thanks",
    });
    await setTriedProduct(db, ws, "hn", "sarahk", true, NOW);

    const { me, people } = await listPeople(db, ws, "hn");
    expect(me).toBe("mathisg");
    expect(people.map((p) => [p.handle, p.kind, p.triedAt])).toEqual([
      ["sarahk", "thanked", NOW],
      ["tomw", "waiting", null],
    ]);

    // Taking the mark back.
    await setTriedProduct(db, ws, "hn", "sarahk", false);
    const again = await listPeople(db, ws, "hn");
    expect(again.people[0]!.triedAt).toBeNull();
  });
});
