import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { reply, topic, workspace } from "@/db/schema";
import { listPeople } from "@/people/queries";
import { nameReplyTopic, unnamedReplyIds } from "@/replies/topics";
import { saveAccount } from "@/workspace/accounts";
import { truncateAll } from "../helpers/truncate";

async function setup() {
  const [ws] = await db
    .insert(workspace)
    .values({ name: "Test" })
    .returning({ id: workspace.id });
  await saveAccount(db, ws!.id, "hn", {
    handle: "mathisg",
    createdAt: new Date("2020-01-01T00:00:00Z"),
    karma: 212,
  });
  return ws!.id;
}

let n = 0;
async function addReply(workspaceId: string, threadTitle: string) {
  n++;
  const [row] = await db
    .insert(reply)
    .values({
      workspaceId,
      platform: "hn",
      externalId: `r${n}`,
      parentExternalId: `p${n}`,
      parentAuthor: `person${n}`,
      threadExternalId: `t${n}`,
      threadTitle,
      text: "Here's what worked for me.",
      url: `https://news.ycombinator.com/item?id=r${n}`,
      postedAt: new Date("2026-09-27T10:00:00Z"),
      raw: {},
    })
    .returning({ id: reply.id });
  return row!.id;
}

const topicsOf = async (workspaceId: string) =>
  (
    await db
      .select({ name: topic.name })
      .from(topic)
      .where(eq(topic.workspaceId, workspaceId))
  ).map((t) => t.name);

describe("nameReplyTopic (mock LLM)", () => {
  beforeEach(truncateAll);
  beforeAll(() => {
    process.env.LLM_PROVIDER = "mock";
  });
  afterAll(() => {
    delete process.env.LLM_PROVIDER;
  });

  it("names each reply's topic and reuses existing ones", async () => {
    const ws = await setup();
    const a = await addReply(ws, "Ask HN: How should I price my SaaS?");
    const b = await addReply(ws, "Ask HN: Is $9/month too cheap?");
    const c = await addReply(ws, "Ask HN: How do I get my first users?");
    expect(await unnamedReplyIds(db, { workspaceId: ws })).toHaveLength(3);

    for (const id of [a, b, c]) await nameReplyTopic(db, id);

    expect((await topicsOf(ws)).sort()).toEqual(["First users", "Pricing"]);
    expect(await unnamedReplyIds(db, { workspaceId: ws })).toEqual([]);
    // Already named: nothing to do.
    expect(await nameReplyTopic(db, a)).toEqual({ status: "skipped" });
  });

  it("matches an existing topic whatever its case", async () => {
    const ws = await setup();
    await db.insert(topic).values({ workspaceId: ws, name: "pricing" });
    const id = await addReply(ws, "Ask HN: Pricing my first SaaS?");
    expect(await nameReplyTopic(db, id)).toEqual({
      status: "named",
      topic: "pricing",
    });
    expect(await topicsOf(ws)).toEqual(["pricing"]);
  });

  it("keeps topics per workspace, and shows them on People", async () => {
    const ws = await setup();
    const other = await setup();
    await nameReplyTopic(db, await addReply(ws, "Ask HN: Pricing?"));
    await nameReplyTopic(db, await addReply(other, "Ask HN: Pricing?"));
    expect(await topicsOf(ws)).toEqual(["Pricing"]);
    expect(await topicsOf(other)).toEqual(["Pricing"]);

    const { topics, people } = await listPeople(db, ws, "hn");
    expect(topics).toMatchObject([
      { name: "Pricing", stage: "planted", people: 1 },
    ]);
    expect(people[0]!.topicIds).toEqual([topics[0]!.id]);
  });
});
