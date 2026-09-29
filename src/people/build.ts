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
  topicId: string | null;
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

// A thread the user marked "I replied" to, before Greer finds the reply.
export type MarkFact = { author: string; title: string; url: string; at: Date };

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
  // Topics of the replies you talked in.
  topicIds: string[];
  triedAt: Date | null;
};

export function buildPeople({
  me,
  replies,
  answers,
  tried,
  marked = [],
}: {
  me: string;
  replies: ReplyFact[];
  answers: AnswerFact[];
  tried: Map<string, Date>;
  // "I replied" marks: someone Greer hasn't found a reply to yet is still
  // someone you replied to, waiting for an answer.
  marked?: MarkFact[];
}): Person[] {
  const isMe = (h: string) => h.toLowerCase() === me.toLowerCase();
  const replyById = new Map(replies.map((r) => [r.id, r]));
  // Comments the user answered: a question among them isn't open anymore.
  const answeredByMe = new Set(replies.map((r) => r.parentExternalId));

  type Acc = {
    threads: Map<string, { title: string; url: string; at: Date }>;
    answers: AnswerFact[];
    topicIds: Set<string>;
    firstAt: Date;
    lastAt: Date;
  };
  const people = new Map<string, Acc>();
  const touch = (handle: string, r: ReplyFact, at: Date) => {
    const acc: Acc = people.get(handle) ?? {
      threads: new Map(),
      answers: [],
      topicIds: new Set(),
      firstAt: at,
      lastAt: at,
    };
    if (r.topicId) acc.topicIds.add(r.topicId);
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

  const known = new Set([...people.keys()].map((h) => h.toLowerCase()));
  for (const m of marked) {
    if (!m.author || isMe(m.author) || known.has(m.author.toLowerCase()))
      continue;
    const acc: Acc = people.get(m.author) ?? {
      threads: new Map(),
      answers: [],
      topicIds: new Set(),
      firstAt: m.at,
      lastAt: m.at,
    };
    acc.threads.set(`mark:${m.title.trim().toLowerCase()}`, {
      title: m.title,
      url: m.url,
      at: m.at,
    });
    if (m.at < acc.firstAt) acc.firstAt = m.at;
    if (m.at > acc.lastAt) acc.lastAt = m.at;
    people.set(m.author, acc);
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
        topicIds: [...acc.topicIds],
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

// A topic grows only from what people do back, never from reply count:
// planted = you replied; growing = someone answered you; rooted = two or
// more people thanked you, or someone came back on this topic.
export type TopicStage = "planted" | "growing" | "rooted";

export type TopicSummary = {
  id: string;
  name: string;
  stage: TopicStage;
  people: number; // people you talked with on it
  thanks: number; // distinct people who thanked you on it
  cameBack: number; // people met in 2+ threads on it
};

export function buildTopics({
  me,
  topics,
  replies,
  answers,
}: {
  me: string;
  topics: { id: string; name: string }[];
  replies: ReplyFact[];
  answers: AnswerFact[];
}): TopicSummary[] {
  const isMe = (h: string) => h.toLowerCase() === me.toLowerCase();
  const replyById = new Map(replies.map((r) => [r.id, r]));
  type Acc = {
    threads: Map<string, Set<string>>; // person -> threads
    thanks: Set<string>;
    answered: boolean;
  };
  const byTopic = new Map<string, Acc>(
    topics.map((t) => [
      t.id,
      { threads: new Map(), thanks: new Set(), answered: false },
    ]),
  );
  const meet = (acc: Acc, handle: string, thread: string) =>
    acc.threads.set(handle, (acc.threads.get(handle) ?? new Set()).add(thread));

  for (const r of replies) {
    const acc = r.topicId ? byTopic.get(r.topicId) : undefined;
    if (acc && r.parentAuthor && !isMe(r.parentAuthor)) {
      meet(acc, r.parentAuthor, r.threadExternalId);
    }
  }
  for (const a of answers) {
    const r = replyById.get(a.replyId);
    const acc = r?.topicId ? byTopic.get(r.topicId) : undefined;
    if (!r || !acc || isMe(a.author)) continue;
    meet(acc, a.author, r.threadExternalId);
    acc.answered = true;
    if (a.tone === "thanks") acc.thanks.add(a.author);
  }

  return topics
    .map((t): TopicSummary => {
      const acc = byTopic.get(t.id)!;
      const cameBack = [...acc.threads.values()].filter(
        (threads) => threads.size >= 2,
      ).length;
      const thanks = acc.thanks.size;
      return {
        id: t.id,
        name: t.name,
        stage:
          thanks >= 2 || cameBack > 0
            ? "rooted"
            : acc.answered
              ? "growing"
              : "planted",
        people: acc.threads.size,
        thanks,
        cameBack,
      };
    })
    .filter((t) => t.people > 0)
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
}
