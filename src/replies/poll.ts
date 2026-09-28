// Finds the user's own comments on a platform and stores them as replies.
// Idempotent: replies are unique per workspace + platform + external id, so a
// retried or overlapping poll inserts nothing twice.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, platformAccount, reply } from "@/db/schema";
import type { Platform, Source } from "@/sources/types";

// The first look goes back a month, so people you already talked with show up.
export const REPLIES_BACKFILL_DAYS = 30;
// Overlap with the previous look so comments indexed late aren't missed.
const OVERLAP_MS = 60 * 60 * 1000;

export type ReplyPollResult = { fetched: number; new: number };

export async function pollReplies(
  db: Db,
  sourceFor: (platform: Platform) => Source,
  workspaceId: string,
  platform: Platform,
  now = new Date(),
): Promise<ReplyPollResult> {
  const [account] = await db
    .select()
    .from(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
      ),
    );
  const source = sourceFor(platform);
  if (!account || !source.fetchUserComments) return { fetched: 0, new: 0 };

  const since = account.repliesCheckedAt
    ? new Date(account.repliesCheckedAt.getTime() - OVERLAP_MS)
    : new Date(now.getTime() - REPLIES_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
  const comments = await source.fetchUserComments(account.handle, since);

  let inserted = 0;
  if (comments.length) {
    const rows = await db
      .insert(reply)
      .values(
        comments.map((c) => ({
          workspaceId,
          platform,
          externalId: c.externalId,
          parentExternalId: c.parentId,
          threadExternalId: c.threadId,
          threadTitle: c.threadTitle,
          text: c.text,
          url: c.url,
          postedAt: c.createdAt,
          raw: c.raw,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: reply.id });
    inserted = rows.length;
  }
  await linkRepliesToItems(db, workspaceId, platform);

  // Only if the account wasn't switched to another handle meanwhile.
  await db
    .update(platformAccount)
    .set({ repliesCheckedAt: now })
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
        eq(platformAccount.handle, account.handle),
      ),
    );
  return { fetched: comments.length, new: inserted };
}

// Points each reply at what Greer already collected: the comment or post it
// answers, or else its thread. Runs every poll, since a thread may be found
// after the reply.
export async function linkRepliesToItems(
  db: Db,
  workspaceId: string,
  platform: Platform,
): Promise<void> {
  for (const column of [reply.parentExternalId, reply.threadExternalId]) {
    await db
      .update(reply)
      .set({
        itemId: sql`(select ${item.id} from ${item} where ${item.workspaceId} = ${workspaceId} and ${item.platform} = ${platform} and ${item.externalId} = ${column})`,
      })
      .where(
        and(
          eq(reply.workspaceId, workspaceId),
          eq(reply.platform, platform),
          isNull(reply.itemId),
          inArray(
            column,
            db
              .select({ id: item.externalId })
              .from(item)
              .where(
                and(
                  eq(item.workspaceId, workspaceId),
                  eq(item.platform, platform),
                ),
              ),
          ),
        ),
      );
  }
}

// Every linked account, for the scheduled poll.
export async function linkedAccounts(db: Db) {
  return db
    .select({
      workspaceId: platformAccount.workspaceId,
      platform: platformAccount.platform,
    })
    .from(platformAccount);
}

// For the Accounts page: how many replies Greer found, and when it last looked.
export async function replyStats(
  db: Db,
  workspaceId: string,
  platform: Platform,
): Promise<{ count: number; checkedAt: Date | null }> {
  const [row] = await db
    .select({
      count:
        sql<number>`(select count(*) from ${reply} where ${reply.workspaceId} = ${workspaceId} and ${reply.platform} = ${platform})`.mapWith(
          Number,
        ),
      checkedAt: platformAccount.repliesCheckedAt,
    })
    .from(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
      ),
    );
  return row ?? { count: 0, checkedAt: null };
}
