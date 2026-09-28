// Loads Today for one workspace: people facts, the help threads worth a
// reply and recent launches, turned into the feed by build.ts.
import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  max,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore, sourceQuery } from "@/db/schema";
import { buildPeople } from "@/people/build";
import { loadPeopleFacts } from "@/people/queries";
import type { Platform } from "@/sources/types";
import { buildToday } from "./build";

// Below this, a thread isn't worth a reply: it never shows on Today.
export const MIN_SCORE = 50;
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
  }: {
    platform: Platform;
    pace: number;
    now?: Date;
  },
) {
  const mine = and(
    eq(item.workspaceId, workspaceId),
    eq(item.platform, platform),
    eq(item.filterStatus, "kept"),
  );
  const [facts, threads, launches] = await Promise.all([
    loadPeopleFacts(db, workspaceId, platform),
    db
      .select({
        id: item.id,
        type: item.type,
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
          eq(item.category, "help"),
          active(now),
          gte(itemScore.score, MIN_SCORE),
        ),
      )
      .orderBy(desc(itemScore.score), desc(item.postedAt), item.id)
      .limit(THREAD_LIMIT),
    // Launches drift by at the bottom whatever their score: they're there
    // to enjoy, not to triage.
    db
      .select({
        id: item.id,
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
          ne(item.triageStatus, "dismissed"),
          gte(
            item.postedAt,
            new Date(now.getTime() - LAUNCH_DAYS * 24 * 60 * 60 * 1000),
          ),
        ),
      )
      .orderBy(desc(item.postedAt), item.id)
      .limit(LAUNCH_LIMIT),
  ]);

  const { me, replies, answers, tried } = facts;
  const people = me ? buildPeople({ me, replies, answers, tried }) : [];
  const today = buildToday({
    me,
    people,
    replies,
    answers,
    threads,
    launches,
    pace,
    now,
  });
  // The last two days, enough for "today" in any time zone.
  const since = now.getTime() - 48 * 60 * 60 * 1000;
  return {
    me,
    people,
    day: {
      replies: replies
        .filter((r) => r.postedAt.getTime() >= since)
        .map((r) => ({
          id: r.id,
          at: r.postedAt,
          handle: r.parentAuthor || null,
        })),
      answers: answers
        .filter(
          (a) =>
            a.postedAt.getTime() >= since &&
            a.author.toLowerCase() !== me?.toLowerCase(),
        )
        .map((a) => ({ at: a.postedAt, author: a.author })),
    },
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
