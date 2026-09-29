import { describe, expect, it } from "vitest";
import { type AnswerFact, buildPeople, type ReplyFact } from "@/people/build";
import {
  buildToday,
  type HelpThread,
  type Launch,
  type Mark,
  seenSubjectsOf,
} from "./build";

const NOW = new Date("2026-09-28T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function reply(id: string, over: Partial<ReplyFact> = {}): ReplyFact {
  return {
    id,
    externalId: `c${id}`,
    parentExternalId: `p${id}`,
    parentAuthor: null,
    threadExternalId: `t${id}`,
    threadTitle: `Thread ${id}`,
    url: `https://news.ycombinator.com/item?id=c${id}`,
    postedAt: hoursAgo(100),
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
    postedAt: hoursAgo(3),
    tone: "thanks",
    ...over,
  };
}

const thread = (
  id: string,
  author: string,
  score = 80,
  category: HelpThread["category"] = "help",
): HelpThread => ({
  id,
  category,
  author,
  title: `Thread ${id}`,
  threadId: `h${id}`,
  postedAt: hoursAgo(2),
  score,
});

const launch = (author: string, h = 4): Launch => ({
  id: `l-${author}`,
  threadId: `lt-${author}`,
  author,
  title: `Show HN: ${author}'s thing`,
  url: "https://news.ycombinator.com/item?id=1",
  postedAt: hoursAgo(h),
});

function today({
  replies = [] as ReplyFact[],
  answers = [] as AnswerFact[],
  threads = [] as HelpThread[],
  launches = [] as Launch[],
  marks = [] as Mark[],
  seen = new Set<string>(),
  pace = 3,
} = {}) {
  const people = buildPeople({
    me: "mathisg",
    replies,
    answers,
    tried: new Map(),
  });
  return buildToday({
    me: "mathisg",
    people,
    replies,
    answers,
    threads,
    launches,
    marks,
    seen,
    pace,
    now: NOW,
  });
}

const summary = (entries: { kind: string; handle: string }[]) =>
  entries.map((e) => `${e.kind}:${e.handle}`);

describe("buildToday", () => {
  it("caps new people at the pace, keeping the rest for Show more", () => {
    const { entries, more } = today({
      threads: ["a", "b", "c", "d", "e"].map((x) => thread(x, `new_${x}`)),
    });
    expect(summary(entries)).toEqual([
      "stuck:new_a",
      "stuck:new_b",
      "stuck:new_c",
    ]);
    expect(summary(more)).toEqual(["stuck:new_d", "stuck:new_e"]);
  });

  it("never caps people you know: their threads are tagged, not counted", () => {
    const { entries, more } = today({
      replies: [reply("1", { parentAuthor: "ana_r" })],
      threads: [
        thread("a", "new_a"),
        thread("b", "ANA_R"),
        thread("c", "new_c"),
      ],
      pace: 1,
    });
    expect(summary(entries)).toEqual(["stuck:new_a", "asks:ana_r"]);
    expect(summary(more)).toEqual(["stuck:new_c"]);
  });

  it("puts open questions first, then alternates new and known people", () => {
    const { entries } = today({
      replies: [reply("1"), reply("2"), reply("3")],
      answers: [
        answer("1", {
          author: "sarahk",
          tone: "thanks",
          postedAt: hoursAgo(3),
        }),
        answer("2", { author: "devon_b", tone: "question" }),
        answer("3", { author: "tomw", tone: "neutral", postedAt: hoursAgo(1) }),
      ],
      threads: [thread("a", "kvn"), thread("b", "lena")],
    });
    expect(summary(entries)).toEqual([
      "answer:devon_b",
      "stuck:kvn",
      "answer:tomw",
      "stuck:lena",
      "answer:sarahk",
    ]);
    expect(entries[0]).toMatchObject({ answer: { open: true } });
  });

  it("keeps a question until the user answers it, and old news fades", () => {
    const { entries } = today({
      replies: [
        reply("1"),
        reply("2"),
        reply("3"),
        // The user answered devon_b's question on reply 2.
        reply("4", { parentExternalId: "a2" }),
      ],
      answers: [
        answer("1", {
          author: "ana_r",
          tone: "question",
          postedAt: hoursAgo(24 * 10),
        }),
        answer("2", { author: "devon_b", tone: "question" }),
        answer("3", { author: "tomw", postedAt: hoursAgo(24 * 4) }),
      ],
    });
    expect(summary(entries)).toEqual(["answer:ana_r", "answer:devon_b"]);
    expect(entries.map((e) => e.kind === "answer" && e.answer.open)).toEqual([
      true,
      false,
    ]);
  });

  it("shows one card per person: an open question wins over later thanks", () => {
    const { entries } = today({
      replies: [reply("1"), reply("2")],
      answers: [
        answer("1", {
          author: "devon_b",
          tone: "question",
          postedAt: hoursAgo(9),
        }),
        answer("2", {
          author: "devon_b",
          tone: "thanks",
          postedAt: hoursAgo(1),
        }),
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      handle: "devon_b",
      answer: { tone: "question", open: true },
    });
  });

  it("adds a known person's launch to their news, or on its own", () => {
    const { entries } = today({
      replies: [reply("1"), reply("2", { parentAuthor: "rhea" })],
      answers: [answer("1", { author: "sarahk" })],
      launches: [launch("sarahk"), launch("rhea"), launch("stranger")],
    });
    expect(summary(entries)).toEqual(["answer:sarahk", "launch:rhea"]);
    expect(entries[0]).toMatchObject({ launch: { id: "l-sarahk" } });
  });

  it("drops news the user already read, but keeps questions to answer", () => {
    const facts = {
      replies: [reply("1"), reply("2"), reply("3", { parentAuthor: "rhea" })],
      answers: [
        answer("1", { author: "sarahk" }),
        answer("2", { author: "devon_b", tone: "question" }),
      ],
      launches: [launch("rhea")],
    };
    const before = today(facts).entries;
    expect(summary(before)).toEqual([
      "answer:devon_b",
      "answer:sarahk",
      "launch:rhea",
    ]);
    // Each card says what it shows; a question to the user says nothing.
    expect(before.map(seenSubjectsOf)).toEqual([
      [],
      ["answer:a1"],
      ["item:l-rhea"],
    ]);

    const seen = new Set([...before.flatMap(seenSubjectsOf), "answer:a2"]);
    expect(summary(today({ ...facts, seen }).entries)).toEqual([
      "answer:devon_b",
    ]);
  });

  it("brings a known person back when something new comes after what was read", () => {
    const facts = {
      replies: [reply("1"), reply("2")],
      answers: [
        answer("1", { author: "sarahk", postedAt: hoursAgo(20) }),
        answer("2", {
          author: "sarahk",
          tone: "neutral",
          postedAt: hoursAgo(2),
        }),
      ],
    };
    const { entries } = today({ ...facts, seen: new Set(["answer:a1"]) });
    expect(entries[0]).toMatchObject({ answer: { externalId: "a2" } });
  });

  it("shows one card per person, and paces people rather than threads", () => {
    const { entries, more } = today({
      threads: [
        thread("a", "founder", 92),
        thread("b", "Founder", 90),
        thread("c", "kvn", 85),
        thread("d", "founder", 60),
        thread("e", "lena", 50),
      ],
      pace: 2,
    });
    expect(summary(entries)).toEqual(["stuck:founder", "stuck:kvn"]);
    expect(entries[0]).toMatchObject({
      threadId: "a",
      otherThreadIds: ["b", "d"],
    });
    expect(summary(more)).toEqual(["stuck:lena"]);
  });

  it("brings launches by new people into the same pool and pace", () => {
    const { entries, more } = today({
      replies: [reply("1", { parentAuthor: "sarahk" })],
      threads: [
        thread("a", "kvn", 92),
        thread("b", "maker", 85, "feedback"),
        // sarahk's launch is her news, not a new person's.
        thread("c", "sarahk", 84, "feedback"),
        thread("d", "lena", 70),
      ],
      pace: 2,
    });
    expect(summary(entries)).toEqual(["stuck:kvn", "launched:maker"]);
    expect(summary(more)).toEqual(["stuck:lena"]);
  });

  it("gives launches at most one new-person slot in three", () => {
    const { entries, more } = today({
      threads: [
        thread("a", "maker_a", 95, "feedback"),
        thread("b", "maker_b", 90, "feedback"),
        thread("c", "kvn", 70),
        thread("d", "maker_d", 65, "feedback"),
      ],
      pace: 3,
    });
    // One launch, then the stuck person; the other launches wait.
    expect(summary(entries)).toEqual(["launched:maker_a", "stuck:kvn"]);
    expect(summary(more)).toEqual(["launched:maker_b", "launched:maker_d"]);
  });

  it("skips the user's own threads and threads they already replied in", () => {
    const { entries } = today({
      replies: [reply("1", { threadExternalId: "hb" })],
      threads: [
        thread("a", "MathisG"),
        thread("b", "kvn"),
        thread("c", "lena"),
      ],
    });
    expect(summary(entries)).toEqual(["stuck:lena"]);
  });

  it("takes a person's earlier threads off once you replied to them", () => {
    const later = { ...thread("c", "kvn"), postedAt: hoursAgo(0.5) };
    const { entries } = today({
      // Replied to kvn an hour ago, in another thread of theirs.
      replies: [
        reply("1", {
          parentAuthor: "kvn",
          threadExternalId: "other",
          postedAt: hoursAgo(1),
        }),
      ],
      threads: [thread("a", "KVN"), thread("b", "lena"), later],
    });
    // Their thread from before the reply is gone; the one after is news
    // (kvn is someone the user knows now).
    expect(summary(entries)).toEqual(["stuck:lena", "asks:kvn"]);
    expect(entries[1]).toMatchObject({ threadId: "c", otherThreadIds: [] });
  });

  it('does the same for an "I replied" mark Greer hasn\'t matched yet', () => {
    const { entries, more } = today({
      marks: [{ author: "kvn", at: hoursAgo(1) }],
      threads: [
        thread("a", "kvn"),
        thread("b", "kvn", 70),
        thread("c", "lena"),
      ],
    });
    expect(summary([...entries, ...more])).toEqual(["stuck:lena"]);
  });

  it("treats the same post made twice as one thread", () => {
    const again = { ...thread("b", "abelop", 75), title: " thread A " };
    const { entries } = today({
      threads: [{ ...thread("a", "abelop"), title: "Thread A" }, again],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ threadId: "a", otherThreadIds: [] });
  });

  it("doesn't bring back a launch the user already replied to as news", () => {
    const replies = [
      reply("1", {
        parentAuthor: "abelop",
        threadExternalId: "lt-abelop",
        postedAt: hoursAgo(1),
      }),
    ];
    // Replied in the launch itself, or to the maker after it was posted.
    expect(today({ replies, launches: [launch("abelop", 6)] }).entries).toEqual(
      [],
    );
    const elsewhere = [{ ...replies[0]!, threadExternalId: "other" }];
    expect(
      today({ replies: elsewhere, launches: [launch("abelop", 6)] }).entries,
    ).toEqual([]);
    // A launch posted after the reply is news.
    expect(
      summary(
        today({ replies: elsewhere, launches: [launch("abelop", 0.5)] })
          .entries,
      ),
    ).toEqual(["launch:abelop"]);
  });

  it("counts the week from what people did, not from replies sent", () => {
    const { week } = today({
      replies: [
        reply("1", { parentAuthor: "sarahk", postedAt: hoursAgo(2) }),
        reply("2", { parentAuthor: "old_friend", postedAt: hoursAgo(24 * 30) }),
        reply("3", { parentAuthor: "nobody_answered", postedAt: hoursAgo(5) }),
      ],
      answers: [
        answer("1", { author: "sarahk", tone: "thanks" }),
        answer("2", {
          author: "old_friend",
          tone: "neutral",
          postedAt: hoursAgo(24 * 20),
        }),
      ],
    });
    expect(week).toEqual({ thanked: 1, talking: 1, met: 2 });
  });
});
