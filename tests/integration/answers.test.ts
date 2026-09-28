import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { reply, replyAnswer, workspace } from "@/db/schema";
import { pollAnswers, recentAnswers } from "@/replies/answers";
import { classifyReplyAnswer, unclassifiedAnswerIds } from "@/replies/classify";
import { SourceHttpError } from "@/sources/http";
import type { Source, ThreadNode } from "@/sources/types";
import { saveAccount } from "@/workspace/accounts";
import { truncateAll } from "../helpers/truncate";

const NOW = new Date("2026-09-28T12:00:00Z");
const HOUR = 3_600_000;

const node = (
  id: string,
  author: string | null,
  text: string,
  children: ThreadNode[] = [],
): ThreadNode => ({
  externalId: id,
  author,
  text,
  createdAt: new Date(NOW.getTime() - HOUR),
  children,
});

// Answers under each reply, by reply external id; missing = deleted (404).
function fakeSource(answers: Record<string, ThreadNode[]>) {
  const calls: string[] = [];
  const source: Source = {
    platform: "hn",
    fetchNew: async () => [],
    permalink: (id) => `https://news.ycombinator.com/item?id=${id}`,
    async fetchThread(id) {
      calls.push(id);
      if (!(id in answers)) {
        throw new SourceHttpError(
          404,
          `https://hn.algolia.com/api/v1/items/${id}`,
        );
      }
      return {
        externalId: id,
        title: "",
        url: "",
        root: node(id, "mathisg", "my reply", answers[id]),
      };
    },
  };
  return { sourceFor: () => source, calls };
}

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
      parentExternalId: "100",
      threadExternalId: "100",
      threadTitle: "Ask HN: Pricing my first SaaS?",
      text: "Try annual plans with two months free.",
      url: `https://news.ycombinator.com/item?id=${externalId}`,
      postedAt: new Date(NOW.getTime() - 3 * HOUR),
      raw: {},
      ...over,
    })
    .returning({ id: reply.id });
  return row!.id;
}

describe("pollAnswers", () => {
  beforeEach(truncateAll);

  it("stores other people's direct answers, once", async () => {
    const ws = await setup();
    const replyId = await addReply(ws, "1");
    const { sourceFor } = fakeSource({
      "1": [
        node("11", "sarahk", "Thanks, trying it tonight!"),
        node("12", "mathisg", "my own follow-up"),
        node("13", null, ""), // deleted
      ],
    });

    const first = await pollAnswers(db, sourceFor, ws, "hn", NOW);
    expect(first).toMatchObject({ checked: 1, new: 1 });
    const rows = await db.select().from(replyAnswer);
    expect(rows).toMatchObject([
      {
        replyId,
        author: "sarahk",
        externalId: "11",
        url: "https://news.ycombinator.com/item?id=11",
        tone: null,
      },
    ]);
    expect(first.newIds).toEqual([rows[0]!.id]);

    // A fresh reply is checked again next poll, without duplicates.
    const again = await pollAnswers(db, sourceFor, ws, "hn", NOW);
    expect(again).toMatchObject({ checked: 1, new: 0 });
  });

  it("checks older replies less often and stops after two weeks", async () => {
    const ws = await setup();
    await addReply(ws, "1", {
      postedAt: new Date(NOW.getTime() - 5 * 24 * HOUR),
      answersCheckedAt: new Date(NOW.getTime() - HOUR),
    });
    await addReply(ws, "2", {
      postedAt: new Date(NOW.getTime() - 20 * 24 * HOUR),
      answersCheckedAt: new Date(NOW.getTime() - 10 * 24 * HOUR),
    });
    // Old, but never checked: from the 30-day backfill.
    await addReply(ws, "3", {
      postedAt: new Date(NOW.getTime() - 20 * 24 * HOUR),
    });
    const { sourceFor, calls } = fakeSource({ "1": [], "2": [], "3": [] });

    await pollAnswers(db, sourceFor, ws, "hn", NOW);
    expect(calls).toEqual(["3"]);
  });

  it("treats a deleted reply as having no answers", async () => {
    const ws = await setup();
    const id = await addReply(ws, "gone");
    const { sourceFor } = fakeSource({});
    expect(await pollAnswers(db, sourceFor, ws, "hn", NOW)).toMatchObject({
      checked: 1,
      new: 0,
    });
    const [row] = await db.select().from(reply).where(eq(reply.id, id));
    expect(row!.answersCheckedAt).toEqual(NOW);
  });

  it("goes away with the reply when the account is removed", async () => {
    const ws = await setup();
    await addReply(ws, "1");
    const { sourceFor } = fakeSource({
      "1": [node("11", "sarahk", "Thanks!")],
    });
    await pollAnswers(db, sourceFor, ws, "hn", NOW);
    await saveAccount(db, ws, "hn", {
      handle: "someone_else",
      createdAt: new Date("2021-01-01T00:00:00Z"),
      karma: 1,
    });
    expect(await db.select().from(replyAnswer)).toHaveLength(0);
  });
});

describe("classifyReplyAnswer (mock LLM)", () => {
  beforeEach(truncateAll);
  beforeAll(() => {
    process.env.LLM_PROVIDER = "mock";
  });
  afterAll(() => {
    delete process.env.LLM_PROVIDER;
  });

  it("stores the tone and the signals behind it", async () => {
    const ws = await setup();
    await addReply(ws, "1");
    const { sourceFor } = fakeSource({
      "1": [
        node("11", "sarahk", "Thanks! Would you do the same for B2B?"),
        node("12", "tomw", "Cold email worked fine for me."),
      ],
    });
    await pollAnswers(db, sourceFor, ws, "hn", NOW);
    const ids = await unclassifiedAnswerIds(db, { workspaceId: ws });
    expect(ids).toHaveLength(2);

    for (const id of ids) await classifyReplyAnswer(db, id);
    const rows = await db.select().from(replyAnswer);
    const byAuthor = Object.fromEntries(rows.map((r) => [r.author, r]));
    expect(byAuthor.sarahk).toMatchObject({
      tone: "question",
      thanked: true,
      asked: true,
      promptVersion: "classify-answer-v1",
    });
    expect(byAuthor.tomw!.tone).toBe("neutral");
    expect(await unclassifiedAnswerIds(db)).toEqual([]);
  });
});

describe("recentAnswers", () => {
  beforeEach(truncateAll);

  it("lists the last week's answers, newest first, for one workspace", async () => {
    const ws = await setup();
    const other = await setup();
    const replyId = await addReply(ws, "1");
    const otherReply = await addReply(other, "2");
    const answer = (id: string, r: string, w: string, hoursAgo: number) => ({
      workspaceId: w,
      replyId: r,
      platform: "hn" as const,
      externalId: id,
      author: `user${id}`,
      text: "Thanks!",
      url: `https://news.ycombinator.com/item?id=${id}`,
      postedAt: new Date(NOW.getTime() - hoursAgo * HOUR),
    });
    await db
      .insert(replyAnswer)
      .values([
        answer("a", replyId, ws, 5),
        answer("b", replyId, ws, 1),
        answer("old", replyId, ws, 24 * 8),
        answer("c", otherReply, other, 1),
      ]);

    const rows = await recentAnswers(db, ws, { now: NOW });
    expect(rows.map((r) => r.author)).toEqual(["userb", "usera"]);
    expect(rows[0]!.threadTitle).toBe("Ask HN: Pricing my first SaaS?");
  });
});
