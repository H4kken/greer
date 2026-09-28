// Turns the user's replies and the answers to them into people. Pure, so the
// rules (who counts, what "came back" means) are unit-tested.
import type { AnswerTone } from "@/replies/classify";

export type ReplyFact = {
  id: string;
  externalId: string;
  parentExternalId: string;
  parentAuthor: string | null; // "" = unknown
  threadExternalId: string;
  threadTitle: string;
  url: string;
  postedAt: Date;
};

export type AnswerFact = {
  replyId: string;
  externalId: string;
  author: string;
  text: string;
  url: string;
  postedAt: Date;
  tone: AnswerTone | null;
};

// thanked: said thanks at least once. talked: answered, no thanks yet.
// waiting: the user replied to them, no answer yet.
export type PersonKind = "thanked" | "talked" | "waiting";

export type Person = {
  handle: string;
  kind: PersonKind;
  // Distinct threads you talked in: 2+ means they came back.
  conversations: number;
  firstAt: Date;
  lastAt: Date;
  latest: { text: string; tone: AnswerTone | null; url: string } | null;
  // Their latest question to you that you haven't answered yet.
  openQuestion: { text: string; url: string } | null;
  threads: { title: string; url: string }[];
  triedAt: Date | null;
};

export function buildPeople({
  me,
  replies,
  answers,
  tried,
}: {
  me: string;
  replies: ReplyFact[];
  answers: AnswerFact[];
  tried: Map<string, Date>;
}): Person[] {
  const isMe = (h: string) => h.toLowerCase() === me.toLowerCase();
  const replyById = new Map(replies.map((r) => [r.id, r]));
  // Comments the user answered: a question among them isn't open anymore.
  const answeredByMe = new Set(replies.map((r) => r.parentExternalId));

  type Acc = {
    threads: Map<string, { title: string; url: string; at: Date }>;
    answers: AnswerFact[];
    firstAt: Date;
    lastAt: Date;
  };
  const people = new Map<string, Acc>();
  const touch = (handle: string, r: ReplyFact, at: Date) => {
    const acc: Acc = people.get(handle) ?? {
      threads: new Map(),
      answers: [],
      firstAt: at,
      lastAt: at,
    };
    const thread = acc.threads.get(r.threadExternalId);
    if (!thread || thread.at < r.postedAt) {
      acc.threads.set(r.threadExternalId, {
        title: r.threadTitle,
        url: r.url,
        at: r.postedAt,
      });
    }
    if (at < acc.firstAt) acc.firstAt = at;
    if (at > acc.lastAt) acc.lastAt = at;
    people.set(handle, acc);
    return acc;
  };

  for (const r of replies) {
    if (r.parentAuthor && !isMe(r.parentAuthor)) {
      touch(r.parentAuthor, r, r.postedAt);
    }
  }
  for (const a of answers) {
    const r = replyById.get(a.replyId);
    if (!r || isMe(a.author)) continue;
    touch(a.author, r, a.postedAt).answers.push(a);
  }

  return [...people.entries()]
    .map(([handle, acc]): Person => {
      const byNewest = [...acc.answers].sort(
        (x, y) => y.postedAt.getTime() - x.postedAt.getTime(),
      );
      const latest = byNewest[0];
      const question = byNewest.find(
        (a) => a.tone === "question" && !answeredByMe.has(a.externalId),
      );
      const thanked = acc.answers.some((a) => a.tone === "thanks");
      return {
        handle,
        kind: thanked ? "thanked" : acc.answers.length ? "talked" : "waiting",
        conversations: acc.threads.size,
        firstAt: acc.firstAt,
        lastAt: acc.lastAt,
        latest: latest
          ? { text: latest.text, tone: latest.tone, url: latest.url }
          : null,
        openQuestion: question
          ? { text: question.text, url: question.url }
          : null,
        threads: [...acc.threads.values()]
          .sort((x, y) => y.at.getTime() - x.at.getTime())
          .slice(0, 5)
          .map(({ title, url }) => ({ title, url })),
        triedAt: tried.get(handle) ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(!!b.openQuestion) - Number(!!a.openQuestion) ||
        b.conversations - a.conversations ||
        b.lastAt.getTime() - a.lastAt.getTime(),
    );
}

// The long game, from helping to trying the product. Greer sees the first
// three steps; the user marks the last one.
export function pathOf(people: Person[]) {
  return {
    helped: people.length,
    answered: people.filter((p) => p.kind !== "waiting").length,
    cameBack: people.filter((p) => p.conversations >= 2).length,
    tried: people.filter((p) => p.triedAt).length,
  };
}
