import { describe, expect, it } from "vitest";
import {
  type AnswerFact,
  buildPeople,
  buildTopics,
  pathOf,
  type ReplyFact,
} from "./build";

const at = (h: number) => new Date(Date.UTC(2026, 8, 20, h));

function reply(id: string, over: Partial<ReplyFact> = {}): ReplyFact {
  return {
    id,
    externalId: `c${id}`,
    parentExternalId: `p${id}`,
    parentAuthor: "sarahk",
    threadExternalId: `t${id}`,
    threadTitle: `Thread ${id}`,
    url: `https://news.ycombinator.com/item?id=c${id}`,
    postedAt: at(1),
    topicId: null,
    ...over,
  };
}

function answer(replyId: string, over: Partial<AnswerFact> = {}): AnswerFact {
  return {
    replyId,
    externalId: `a${replyId}`,
    author: "sarahk",
    text: "Thanks!",
    url: `https://news.ycombinator.com/item?id=a${replyId}`,
    postedAt: at(2),
    tone: "thanks",
    ...over,
  };
}

const build = (replies: ReplyFact[], answers: AnswerFact[] = []) =>
  buildPeople({ me: "mathisg", replies, answers, tried: new Map() });

describe("buildPeople", () => {
  it("counts people you replied to and people who answered you", () => {
    const people = build(
      [reply("1"), reply("2", { parentAuthor: "tomw" })],
      [answer("2", { author: "devon_b", tone: "neutral" })],
    );
    expect(Object.fromEntries(people.map((p) => [p.handle, p.kind]))).toEqual({
      sarahk: "waiting",
      tomw: "waiting",
      devon_b: "talked",
    });
  });

  it("marks people who thanked you, and who came back in another thread", () => {
    const [sarah] = build(
      [reply("1"), reply("2")],
      [answer("1", { tone: "neutral" }), answer("2", { postedAt: at(5) })],
    );
    expect(sarah).toMatchObject({
      handle: "sarahk",
      kind: "thanked",
      conversations: 2,
      firstAt: at(1),
      lastAt: at(5),
      latest: { text: "Thanks!", tone: "thanks" },
    });
    expect(pathOf([sarah!])).toEqual({
      helped: 1,
      answered: 1,
      cameBack: 1,
      tried: 0,
    });
  });

  it("counts one thread once, however many replies", () => {
    const [sarah] = build([reply("1"), reply("2", { threadExternalId: "t1" })]);
    expect(sarah!.conversations).toBe(1);
  });

  it("keeps a question open until you answer it, and lists those people first", () => {
    const question = answer("2", {
      author: "devon_b",
      tone: "question",
      text: "How long did it take?",
    });
    const open = build(
      [reply("1"), reply("2", { parentAuthor: "" })],
      [question],
    );
    expect(open[0]).toMatchObject({
      handle: "devon_b",
      openQuestion: { text: "How long did it take?" },
    });

    const answered = build(
      [
        reply("1"),
        reply("2", { parentAuthor: "" }),
        reply("3", {
          parentExternalId: question.externalId,
          parentAuthor: "devon_b",
        }),
      ],
      [question],
    );
    expect(
      answered.find((p) => p.handle === "devon_b")!.openQuestion,
    ).toBeNull();
  });

  it("leaves out yourself and unknown authors", () => {
    const people = build(
      [
        reply("1", { parentAuthor: "MathisG" }),
        reply("2", { parentAuthor: "" }),
      ],
      [answer("1", { author: "mathisg" })],
    );
    expect(people).toEqual([]);
  });

  it("carries the 'tried your product' mark", () => {
    const people = buildPeople({
      me: "mathisg",
      replies: [reply("1")],
      answers: [],
      tried: new Map([["sarahk", at(9)]]),
    });
    expect(people[0]!.triedAt).toEqual(at(9));
    expect(pathOf(people).tried).toBe(1);
  });
});

describe("buildTopics", () => {
  const topics = [
    { id: "pricing", name: "Pricing" },
    { id: "users", name: "First users" },
    { id: "sales", name: "Sales" },
    { id: "empty", name: "Unused" },
  ];
  const summary = (replies: ReplyFact[], answers: AnswerFact[] = []) =>
    Object.fromEntries(
      buildTopics({ me: "mathisg", topics, replies, answers }).map((t) => [
        t.id,
        t,
      ]),
    );

  it("grows a topic from what people do back, not from reply count", () => {
    const t = summary(
      [
        // Pricing: two people thanked you.
        reply("1", { topicId: "pricing", parentAuthor: "sarahk" }),
        reply("2", { topicId: "pricing", parentAuthor: "ana_r" }),
        // First users: one answer, no thanks.
        reply("3", { topicId: "users", parentAuthor: "devon_b" }),
        // Sales: three replies, nobody answered.
        reply("4", { topicId: "sales", parentAuthor: "a1" }),
        reply("5", { topicId: "sales", parentAuthor: "a2" }),
        reply("6", { topicId: "sales", parentAuthor: "a3" }),
      ],
      [
        answer("1"),
        answer("2", { author: "ana_r" }),
        answer("3", { author: "devon_b", tone: "question" }),
      ],
    );
    expect(t.pricing).toMatchObject({ stage: "rooted", people: 2, thanks: 2 });
    expect(t.users).toMatchObject({ stage: "growing", people: 1, thanks: 0 });
    expect(t.sales).toMatchObject({ stage: "planted", people: 3 });
    expect(t.empty).toBeUndefined(); // no one talked about it
  });

  it("roots a topic when someone comes back to it in another thread", () => {
    const t = summary([
      reply("1", { topicId: "users", parentAuthor: "devon_b" }),
      reply("2", { topicId: "users", parentAuthor: "devon_b" }),
    ]);
    expect(t.users).toMatchObject({ stage: "rooted", cameBack: 1 });
  });

  it("gives each person the topics they talked about", () => {
    const [sarah] = build([
      reply("1", { topicId: "pricing" }),
      reply("2", { topicId: "users" }),
    ]);
    expect(sarah!.topicIds.sort()).toEqual(["pricing", "users"]);
  });
});
