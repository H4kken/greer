// How the conversation around a Today thread is going: comments in the
// thread, replies to the person, and whether they're still around. Checked
// only for threads Today could show, at most every CHECK_EVERY_MINUTES, one
// source request each. No AI: the platform already says it.
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore } from "@/db/schema";
import type { Platform, Source } from "@/sources/types";
import { FRESH_HOURS, worthAReply } from "./queries";

export const CHECK_EVERY_MINUTES = 30;
// Per sweep (every 15 minutes): the best threads first, so the cards people
// see are the ones kept current.
export const CHECKS_PER_SWEEP = 40;

// Threads that could be on Today and haven't been checked lately.
export async function activityCandidates(db: Db, now = new Date()) {
  const MINUTE = 60_000;
  return (
    db
      .select({
        id: item.id,
        workspaceId: item.workspaceId,
        platform: item.platform,
        externalId: item.externalId,
        threadId: item.threadId,
        author: item.author,
      })
      .from(item)
      .innerJoin(itemScore, eq(itemScore.itemId, item.id))
      .where(
        and(
          eq(item.filterStatus, "kept"),
          eq(item.triageStatus, "new"),
          worthAReply(),
          gte(
            item.postedAt,
            new Date(now.getTime() - FRESH_HOURS * 60 * MINUTE),
          ),
          or(
            isNull(item.activityCheckedAt),
            lt(
              item.activityCheckedAt,
              new Date(now.getTime() - CHECK_EVERY_MINUTES * MINUTE),
            ),
          ),
        ),
      )
      // Never checked first, then the best matches.
      .orderBy(
        sql`${item.activityCheckedAt} asc nulls first`,
        desc(itemScore.score),
        desc(item.postedAt),
      )
      .limit(CHECKS_PER_SWEEP)
  );
}

// Checks the candidates, one source request each. A failed check is skipped
// (the next sweep tries again); the rest go on.
export async function refreshActivity(
  db: Db,
  sourceFor: (platform: Platform) => Source,
  now = new Date(),
): Promise<{ checked: number; failed: number }> {
  let checked = 0;
  let failed = 0;
  for (const c of await activityCandidates(db, now)) {
    const source = sourceFor(c.platform);
    if (!source.fetchActivity) continue;
    try {
      const a = await source.fetchActivity(c);
      await db
        .update(item)
        .set({
          commentCount: a.comments,
          repliesToItem: a.repliesToItem,
          authorActiveAt: a.authorActiveAt,
          activityCheckedAt: now,
        })
        .where(and(eq(item.workspaceId, c.workspaceId), eq(item.id, c.id)));
      checked++;
    } catch (error) {
      failed++;
      console.warn(`[activity] item ${c.id}:`, (error as Error).message);
    }
  }
  return { checked, failed };
}
