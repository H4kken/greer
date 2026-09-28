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

export type HelpThread = {
  id: string;
  author: string;
  threadId: string;
  postedAt: Date;
  score: number;
};

export type Launch = {
  id: string;
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
    })
  // Someone you know launched something, with nothing else new from them.
  | (Known & {
      key: string;
      kind: "launch";
      handle: string;
      at: Date;
      launch: Launch;
    })
  // Someone new is stuck on something you know about.
  | {
      key: string;
      kind: "stuck";
      handle: string;
      at: Date;
      threadId: string;
    };

export const entryKey = {
  thread: (itemId: string) => `item:${itemId}`,
  person: (handle: string) => `person:${handle}`,
};

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
  pace,
  now = new Date(),
}: {
  me: string | null;
  people: Person[];
  replies: ReplyFact[];
  answers: AnswerFact[];
  // Scored help threads worth a reply, best first.
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
  const stuck: TodayEntry[] = [];
  for (const t of threads) {
    if (isMe(t.author) || repliedIn.has(t.threadId)) continue;
    const person = known.get(lower(t.author));
    const base = {
      key: entryKey.thread(t.id),
      handle: person?.handle ?? t.author,
      at: t.postedAt,
      threadId: t.id,
    };
    if (person) asks.push({ ...base, kind: "asks", person });
    else stuck.push({ ...base, kind: "stuck" });
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
  const picks = stuck.slice(0, Math.max(0, pace));

  const recentAnswers = answers.filter(
    (a) => !isMe(a.author) && a.postedAt.getTime() >= since(WEEK_DAYS),
  );
  const distinct = (xs: string[]) => new Set(xs.map(lower)).size;
  return {
    entries: [...questions, ...alternate(picks, others)],
    more: stuck.slice(picks.length),
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
