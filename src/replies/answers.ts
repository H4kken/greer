// Finds the direct answers other people wrote under the user's replies.
// Idempotent: answers are unique per workspace + platform + external id.
import { and, asc, eq, gte, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { platformAccount, reply, replyAnswer } from "@/db/schema";
import { SourceHttpError } from "@/sources/http";
import type { Platform, Source, Thread } from "@/sources/types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Most HN conversations are over within two weeks.
export const WATCH_DAYS = 14;
// Upper bound on requests per poll; the rest wait for the next one.
export const MAX_REPLIES_PER_POLL = 50;

// Fresh replies are checked every poll, then less and less often. A reply
// never checked (e.g. from the 30-day backfill) is checked once, whatever its age.
export function answersDue(
  postedAt: Date,
  checkedAt: Date | null,
  now: Date,
): boolean {
  if (!checkedAt) return true;
  const age = now.getTime() - postedAt.getTime();
  if (age > WATCH_DAYS * DAY) return false;
  const interval = age < DAY ? 0 : age < 3 * DAY ? HOUR : 6 * HOUR;
  return now.getTime() - checkedAt.getTime() >= interval;
}

export type AnswersPollResult = {
  checked: number;
  new: number;
  // New answers: ready to be classified.
  newIds: string[];
};

export async function pollAnswers(
  db: Db,
  sourceFor: (platform: Platform) => Source,
  workspaceId: string,
  platform: Platform,
  now = new Date(),
): Promise<AnswersPollResult> {
  const [account] = await db
    .select({ handle: platformAccount.handle })
    .from(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, workspaceId),
        eq(platformAccount.platform, platform),
      ),
    );
  if (!account) return { checked: 0, new: 0, newIds: [] };

  const candidates = await db
    .select({
      id: reply.id,
      externalId: reply.externalId,
      postedAt: reply.postedAt,
      answersCheckedAt: reply.answersCheckedAt,
    })
    .from(reply)
    .where(
      and(
        eq(reply.workspaceId, workspaceId),
        eq(reply.platform, platform),
        or(
          isNull(reply.answersCheckedAt),
          gte(reply.postedAt, new Date(now.getTime() - WATCH_DAYS * DAY)),
        ),
      ),
    )
    // Never-checked first, then the longest waiting.
    .orderBy(sql`${reply.answersCheckedAt} asc nulls first`, asc(reply.id));
  const due = candidates
    .filter((r) => answersDue(r.postedAt, r.answersCheckedAt, now))
    .slice(0, MAX_REPLIES_PER_POLL);

  const source = sourceFor(platform);
  const newIds: string[] = [];
  for (const r of due) {
    let thread: Thread | null;
    try {
      thread = await source.fetchThread(r.externalId);
    } catch (error) {
      // A deleted reply: nothing to watch. Anything else retries the job.
      if (!(error instanceof SourceHttpError && error.status === 404)) {
        throw error;
      }
      thread = null;
    }
    const answers = (thread?.root.children ?? []).filter(
      (c) =>
        c.author &&
        c.text &&
        c.author.toLowerCase() !== account.handle.toLowerCase(),
    );
    if (answers.length) {
      const rows = await db
        .insert(replyAnswer)
        .values(
          answers.map((a) => ({
            workspaceId,
            replyId: r.id,
            platform,
            externalId: a.externalId,
            author: a.author!,
            text: a.text,
            url: source.permalink(a.externalId),
            postedAt: a.createdAt,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: replyAnswer.id });
      newIds.push(...rows.map((row) => row.id));
    }
    await db
      .update(reply)
      .set({ answersCheckedAt: now })
      .where(eq(reply.id, r.id));
  }
  return { checked: due.length, new: newIds.length, newIds };
}
