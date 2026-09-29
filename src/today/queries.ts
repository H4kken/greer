// Loads Today for one workspace: people facts, the help threads worth a
// reply and recent launches, turned into the feed by build.ts.
import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  lte,
  max,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "@/db";
import {
  item,
  itemScore,
  platformAccount,
  reply,
  sourceQuery,
} from "@/db/schema";
import { buildPeople } from "@/people/build";
import { loadPeopleFacts } from "@/people/queries";
import type { Platform } from "@/sources/types";
import { dayProgress, sameDayAs } from "./progress";
import { buildToday } from "./build";

// Below this, a thread isn't worth a reply: it never shows on Today.
export const MIN_SCORE = 50;
// Older threads rarely need a reply anymore; 72 hours, not 48, so a
// weekend away doesn't hide Friday's threads.
export const FRESH_HOURS = 72;
// More than a day's worth: "Show more" opens them.
const THREAD_LIMIT = 60;
const LAUNCH_DAYS = 7;
const LAUNCH_LIMIT = 16;

// New, or snoozed (by the old inbox) until a time that has passed.
const active = (now: Date): SQL =>
  sql`(${item.triageStatus} = 'new' or (${item.triageStatus} = 'snoozed' and ${item.snoozedUntil} <= ${now}))`;

export async function loadToday(
  db: Db,
  workspaceId: string,
  {
    platform,
    pace,
    now = new Date(),
    isToday = sameDayAs(now, null),
  }: {
    platform: Platform;
    pace: number;
    now?: Date;
    // What "today" is for the viewer (see sameDayAs).
    isToday?: (d: Date) => boolean;
  },
) {
  const mine = and(
    eq(item.workspaceId, workspaceId),
    eq(item.platform, platform),
    eq(item.filterStatus, "kept"),
  );
  const HOUR = 60 * 60 * 1000;
  const [facts, threads, launches, marked] = await Promise.all([
    loadPeopleFacts(db, workspaceId, platform),
    db
      .select({
        id: item.id,
        type: item.type,
        category: item.category,
        author: item.author,
        title: item.title,
        // Enough for the panel; the full thread is on HN.
        text: sql<string>`left(${item.text}, 6000)`,
        url: item.url,
        threadId: item.threadId,
        postedAt: item.postedAt,
        score: itemScore.score,
        criteria: itemScore.criteria,
        reason: itemScore.reason,
      })
      .from(item)
      .innerJoin(itemScore, eq(itemScore.itemId, item.id))
      .where(
        and(
          mine,
          // Help threads, and launches themselves (not comments under them).
          or(eq(item.category, "help"), eq(item.type, "story")),
          active(now),
          gte(itemScore.score, MIN_SCORE),
          gte(item.postedAt, new Date(now.getTime() - FRESH_HOURS * HOUR)),
        ),
      )
      .orderBy(desc(itemScore.score), desc(item.postedAt), item.id)
      .limit(THREAD_LIMIT),
    // Launches, whatever their score: a launch by someone you know is news.
    db
      .select({
        id: item.id,
        threadId: item.threadId,
        author: item.author,
        title: item.title,
        url: item.url,
        postedAt: item.postedAt,
      })
      .from(item)
      .where(
        and(
          mine,
          eq(item.category, "feedback"),
          eq(item.type, "story"),
          // Not dismissed, and not one the user already said they replied to.
          eq(item.triageStatus, "new"),
          gte(
            item.postedAt,
            new Date(now.getTime() - LAUNCH_DAYS * 24 * 60 * 60 * 1000),
          ),
        ),
      )
      .orderBy(desc(item.postedAt), item.id)
      .limit(LAUNCH_LIMIT),
    // Threads the user said they replied to ("I replied"), for the day's
    // progress until Greer finds the reply itself.
    db
      .select({
        id: item.id,
        author: item.author,
        title: item.title,
        threadId: item.threadId,
        at: item.triagedAt,
      })
      .from(item)
      .where(
        and(
          eq(item.workspaceId, workspaceId),
          eq(item.platform, platform),
          eq(item.triageStatus, "replied"),
          gte(item.triagedAt, new Date(now.getTime() - 48 * HOUR)),
        ),
      ),
  ]);

  const { me, replies, answers, tried } = facts;
  const people = me ? buildPeople({ me, replies, answers, tried }) : [];
  // The last two days, enough for "today" in any time zone.
  const since = now.getTime() - 48 * HOUR;
  const found = replies.filter((r) => r.postedAt.getTime() >= since);
  const foundIn = new Set(found.map((r) => r.threadExternalId));
  // The same post made twice is one thread: a reply in either covers a mark
  // on the other.
  const sameThread = (author: string | null, title: string) =>
    `${(author ?? "").toLowerCase()}|${title.trim().toLowerCase()}`;
  const foundAs = new Set(
    found.map((r) => sameThread(r.parentAuthor, r.threadTitle)),
  );
  const day = {
    replies: [
      ...found.map((r) => ({
        id: r.id,
        at: r.postedAt,
        handle: r.parentAuthor || null,
      })),
      // Marked by hand and not found yet: counted once, not twice.
      ...marked
        .filter(
          (m) =>
            m.at &&
            !foundIn.has(m.threadId) &&
            !foundAs.has(sameThread(m.author, m.title)),
        )
        .map((m) => ({ id: `mark:${m.id}`, at: m.at!, handle: m.author })),
    ],
    answers: answers
      .filter(
        (a) =>
          a.postedAt.getTime() >= since &&
          a.author.toLowerCase() !== me?.toLowerCase(),
      )
      .map((a) => ({ at: a.postedAt, author: a.author })),
  };
  // New people offered today: only the room left in the pace. The rest wait
  // behind "Show more", like everything past the pace.
  const { room } = dayProgress({
    replies: day.replies,
    answers: [],
    pace,
    isToday,
  });
  const today = buildToday({
    me,
    people,
    replies,
    answers,
    threads,
    launches,
    marks: marked.flatMap((m) =>
      m.at ? [{ author: m.author, at: m.at }] : [],
    ),
    pace: room,
    now,
  });
  return {
    me,
    people,
    day,
    topics: facts.topics,
    threads: new Map(threads.map((t) => [t.id, t])),
    launches,
    ...today,
  };
}

export type TodayData = Awaited<ReturnType<typeof loadToday>>;

// Threads the user hid with "Not for me", newest first, to bring one back.
export async function hiddenThreads(
  db: Db,
  workspaceId: string,
  { limit = 100 }: { limit?: number } = {},
) {
  return db
    .select({
      id: item.id,
      author: item.author,
      title: item.title,
      url: item.url,
      category: item.category,
      triagedAt: item.triagedAt,
    })
    .from(item)
    .where(
      and(
        eq(item.workspaceId, workspaceId),
        eq(item.triageStatus, "dismissed"),
      ),
    )
    .orderBy(desc(item.triagedAt), item.id)
    .limit(limit);
}

export const REACH_DAYS = 14;
// At most this many people worth a reply in REACH_DAYS: Today says so.
export const QUIET_REACH = 3;

// How many people worth a reply Hacker News brought lately. For a focused
// product that can be very few; after the first week, Today says so honestly
// instead of looking broken. Null while it's too early to tell.
export async function hnReach(
  db: Db,
  workspaceId: string,
  { onboardedAt, now = new Date() }: { onboardedAt: Date | null; now?: Date },
): Promise<{ people: number; days: number } | null> {
  const DAY = 24 * 60 * 60 * 1000;
  if (!onboardedAt || onboardedAt.getTime() > now.getTime() - 7 * DAY) {
    return null;
  }
  const [row] = await db
    .select({ people: sql<number>`count(distinct lower(${item.author}))::int` })
    .from(item)
    .innerJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(
      and(
        eq(item.workspaceId, workspaceId),
        eq(item.platform, "hn"),
        eq(item.filterStatus, "kept"),
        gte(itemScore.score, MIN_SCORE),
        gte(item.postedAt, new Date(now.getTime() - REACH_DAYS * DAY)),
      ),
    );
  return { people: row?.people ?? 0, days: REACH_DAYS };
}

// Threads found but not scored yet: Today says reading is still going.
export async function unscoredCount(
  db: Db,
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(item)
    .leftJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(
      and(
        eq(item.workspaceId, workspaceId),
        eq(item.filterStatus, "kept"),
        sql`${itemScore.itemId} is null`,
      ),
    );
  return row?.n ?? 0;
}

export async function sourceHealth(db: Db, workspaceId: string) {
  const mine = and(
    eq(sourceQuery.workspaceId, workspaceId),
    eq(sourceQuery.enabled, true),
  );
  const [last] = await db
    .select({ at: max(sourceQuery.lastPolledAt) })
    .from(sourceQuery)
    .where(mine);
  const failing = await db
    .select({
      id: sourceQuery.id,
      label: sourceQuery.label,
      lastError: sourceQuery.lastError,
      lastErrorAt: sourceQuery.lastErrorAt,
    })
    .from(sourceQuery)
    .where(and(mine, isNotNull(sourceQuery.lastError)));
  return { lastCheckAt: last?.at ?? null, failing };
}

// A reply the user marked but Greer hasn't found after this long, with a
// check run since, is worth asking about. Older marks are left alone.
export const MISSING_AFTER_HOURS = 2;
const MISSING_FOR_DAYS = 7;

// "I replied" marks with no reply found in that thread: posted from another
// account, killed on HN, or not posted after all. Only once a reply check
// has run after the mark, so a stopped worker never looks like a miss.
export async function missingReplies(
  db: Db,
  workspaceId: string,
  platform: Platform,
  now = new Date(),
) {
  const HOUR = 60 * 60 * 1000;
  return db
    .select({
      id: item.id,
      author: item.author,
      title: item.title,
      url: item.url,
      markedAt: item.triagedAt,
    })
    .from(item)
    .innerJoin(
      platformAccount,
      and(
        eq(platformAccount.workspaceId, item.workspaceId),
        eq(platformAccount.platform, item.platform),
      ),
    )
    .where(
      and(
        eq(item.workspaceId, workspaceId),
        eq(item.platform, platform),
        eq(item.triageStatus, "replied"),
        lte(
          item.triagedAt,
          new Date(now.getTime() - MISSING_AFTER_HOURS * HOUR),
        ),
        gte(
          item.triagedAt,
          new Date(now.getTime() - MISSING_FOR_DAYS * 24 * HOUR),
        ),
        gt(platformAccount.repliesCheckedAt, item.triagedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(reply)
            .where(
              and(
                eq(reply.workspaceId, item.workspaceId),
                eq(reply.platform, item.platform),
                or(
                  eq(reply.threadExternalId, item.threadId),
                  // The same post made twice: a reply in the other copy.
                  and(
                    sql`lower(${reply.parentAuthor}) = lower(${item.author})`,
                    sql`lower(trim(${reply.threadTitle})) = lower(trim(${item.title}))`,
                  ),
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(item.triagedAt), item.id);
}
