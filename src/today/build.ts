// Turns people, answers and scored threads into Today's feed. Pure, so the
// rules (what counts as news, the pace cap, the order) are unit-tested.
import type { AnswerFact, Person, ReplyFact } from "@/people/build";
import type { AnswerTone } from "@/replies/classify";

const DAY = 24 * 60 * 60 * 1000;
// An answer is news for this long; a question stays until the user answers
// it, as long as the reply is still watched (src/replies/answers.ts).
export const NEWS_DAYS = 3;
export const QUESTION_DAYS = 14;
const WEEK_DAYS = 7;

// A scored thread worth a reply: someone asking for help, or a maker
// launching and asking for feedback.
export type HelpThread = {
  id: string;
  category: "help" | "feedback";
  author: string;
  title: string;
  threadId: string;
  postedAt: Date;
  score: number;
};

export type Launch = {
  id: string;
  threadId: string;
  author: string;
  title: string;
  url: string;
  postedAt: Date;
};

type Known = { person: Person };

export type TodayEntry =
  // Someone you know answered one of your replies.
  | (Known & {
      key: string;
      kind: "answer";
      handle: string;
      at: Date;
      answer: {
        tone: AnswerTone;
        text: string;
        url: string;
        threadTitle: string;
        // A question you haven't answered yet.
        open: boolean;
      };
      launch: Launch | null;
    })
  // Someone you know is asking for help in a thread Greer found.
  | (Known & {
      key: string;
      kind: "asks";
      handle: string;
      at: Date;
      threadId: string;
      // Their other threads, best first: one card per person.
      otherThreadIds: string[];
    })
  // Someone you know launched something, with nothing else new from them.
  | (Known & {
      key: string;
      kind: "launch";
      handle: string;
      at: Date;
      launch: Launch;
    })
  // Someone new is stuck on something you know about, or launched and asks
  // for feedback.
  | {
      key: string;
      kind: "stuck" | "launched";
      handle: string;
      at: Date;
      threadId: string;
      otherThreadIds: string[];
    };

export const entryKey = {
  thread: (itemId: string) => `item:${itemId}`,
  person: (handle: string) => `person:${handle}`,
};

// A thread marked "I replied" that Greer hasn't matched to a reply yet.
export type Mark = { author: string; at: Date };

export type WeekCounts = {
  thanked: number; // people who thanked you
  talking: number; // people who answered you
  met: number; // people you talked with for the first time
};

export function buildToday({
  me,
  people,
  replies,
  answers,
  threads,
  launches,
  marks = [],
  pace,
  now = new Date(),
}: {
  me: string | null;
  people: Person[];
  replies: ReplyFact[];
  answers: AnswerFact[];
  // "I replied" marks, which count like replies until Greer finds them.
  marks?: Mark[];
  // Scored threads worth a reply (help and launches), best first.
  threads: HelpThread[];
  // Recent Show HN posts, newest first.
  launches: Launch[];
  // New people a day, from the account's maturity.
  pace: number;
  now?: Date;
}): { entries: TodayEntry[]; more: TodayEntry[]; week: WeekCounts } {
  const lower = (h: string) => h.toLowerCase();
  const isMe = (h: string) => !!me && lower(h) === lower(me);
  const known = new Map(people.map((p) => [lower(p.handle), p]));
  const since = (days: number) => now.getTime() - days * DAY;
  const replyById = new Map(replies.map((r) => [r.id, r]));
  // Comments the user answered, and threads they already replied in.
  const answeredByMe = new Set(replies.map((r) => r.parentExternalId));
  const repliedIn = new Set(replies.map((r) => r.threadExternalId));
  // When the user last replied to each person. Their threads and launches
  // from before that were already in front of the user (a card they replied
  // from, the same Show HN posted twice): they leave Today. What the person
  // posts afterwards is news again.
  const lastReplyTo = new Map<string, number>();
  const touch = (handle: string | null, at: Date) => {
    if (!handle) return;
    const k = lower(handle);
    lastReplyTo.set(k, Math.max(lastReplyTo.get(k) ?? 0, at.getTime()));
  };
  for (const r of replies) touch(r.parentAuthor, r.postedAt);
  for (const m of marks) touch(m.author, m.at);
  const seenBefore = (author: string, postedAt: Date) =>
    (lastReplyTo.get(lower(author)) ?? 0) >= postedAt.getTime();

  // Each known person's news from their answers: an open question first,
  // else their latest answer if it's recent.
  const newsFrom = new Map<string, TodayEntry & { kind: "answer" }>();
  const byNewest = [...answers].sort(
    (a, b) => b.postedAt.getTime() - a.postedAt.getTime(),
  );
  for (const a of byNewest) {
    const person = known.get(lower(a.author));
    const r = replyById.get(a.replyId);
    if (!person || !r || isMe(a.author)) continue;
    const open =
      a.tone === "question" &&
      !answeredByMe.has(a.externalId) &&
      a.postedAt.getTime() >= since(QUESTION_DAYS);
    const recent = a.postedAt.getTime() >= since(NEWS_DAYS);
    const current = newsFrom.get(person.handle);
    if (!(open || recent) || (current && (current.answer.open || !open)))
      continue;
    newsFrom.set(person.handle, {
      key: entryKey.person(person.handle),
      kind: "answer",
      handle: person.handle,
      person,
      at: a.postedAt,
      answer: {
        tone: a.tone ?? "neutral",
        text: a.text,
        url: a.url,
        threadTitle: r.threadTitle,
        open,
      },
      launch: null,
    });
  }

  const launchedOnly: TodayEntry[] = [];
  for (const l of launches) {
    const person = known.get(lower(l.author));
    if (!person || l.postedAt.getTime() < since(NEWS_DAYS)) continue;
    if (repliedIn.has(l.threadId) || seenBefore(l.author, l.postedAt)) continue;
    const news = newsFrom.get(person.handle);
    if (news) news.launch ??= l;
    else if (!launchedOnly.some((e) => e.handle === person.handle))
      launchedOnly.push({
        key: entryKey.person(person.handle),
        kind: "launch",
        handle: person.handle,
        person,
        at: l.postedAt,
        launch: l,
      });
  }

  const asks: TodayEntry[] = [];
  // New people, stuck or launching, share one pool and one pace.
  const fresh: TodayEntry[] = [];
  // One card per person: their best thread leads, the others come along.
  // The same title twice (a post made again) is one thread.
  const cardOf = new Map<
    string,
    { otherThreadIds: string[]; titles: Set<string> }
  >();
  for (const t of threads) {
    if (isMe(t.author) || repliedIn.has(t.threadId)) continue;
    if (seenBefore(t.author, t.postedAt)) continue;
    const person = known.get(lower(t.author));
    // A launch by someone you know is already their news (see above).
    if (person && t.category === "feedback") continue;
    const card = cardOf.get(lower(t.author));
    const title = t.title.trim().toLowerCase();
    if (card) {
      if (!card.titles.has(title)) card.otherThreadIds.push(t.id);
      card.titles.add(title);
      continue;
    }
    const base = {
      key: entryKey.thread(t.id),
      handle: person?.handle ?? t.author,
      at: t.postedAt,
      threadId: t.id,
      otherThreadIds: [] as string[],
    };
    cardOf.set(lower(t.author), { ...base, titles: new Set([title]) });
    if (person) asks.push({ ...base, kind: "asks", person });
    else
      fresh.push({
        ...base,
        kind: t.category === "feedback" ? "launched" : "stuck",
      });
  }

  const news = [...newsFrom.values()];
  const questions = news
    .filter((e) => e.answer.open)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const others = [
    ...asks,
    ...[...news.filter((e) => !e.answer.open), ...launchedOnly].sort(
      (a, b) => b.at.getTime() - a.at.getTime(),
    ),
  ];
  const picks = fresh.slice(0, Math.max(0, pace));

  const recentAnswers = answers.filter(
    (a) => !isMe(a.author) && a.postedAt.getTime() >= since(WEEK_DAYS),
  );
  const distinct = (xs: string[]) => new Set(xs.map(lower)).size;
  return {
    entries: [...questions, ...alternate(picks, others)],
    more: fresh.slice(picks.length),
    week: {
      thanked: distinct(
        recentAnswers.filter((a) => a.tone === "thanks").map((a) => a.author),
      ),
      talking: distinct(recentAnswers.map((a) => a.author)),
      met: people.filter((p) => p.firstAt.getTime() >= since(WEEK_DAYS)).length,
    },
  };
}

// New and known people take turns, so neither group reads as a separate list.
function alternate<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]!);
    if (b[i]) out.push(b[i]!);
  }
  return out;
}
