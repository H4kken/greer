// Runs one saved query against its platform and stores what it finds.
// Idempotent: items are unique per workspace + platform + external id, and a
// re-found item only gains the query id in matched_query_ids.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, platformAccount, sourceQuery } from "@/db/schema";
import type { Platform, Source } from "@/sources/types";
import { categorize, prefilter } from "./prefilter";

export const BACKFILL_DAYS = 7;
// Overlap with the previous poll so items indexed late aren't missed.
const OVERLAP_MS = 60 * 60 * 1000;

export type PollResult = { fetched: number; new: number; kept: number };

export async function pollQuery(
  db: Db,
  sourceFor: (platform: Platform) => Source,
  queryId: string,
  now = new Date(),
): Promise<PollResult> {
  const [query] = await db
    .select()
    .from(sourceQuery)
    .where(eq(sourceQuery.id, queryId));
  if (!query || !query.enabled) return { fetched: 0, new: 0, kept: 0 };

  const since = query.lastPolledAt
    ? new Date(query.lastPolledAt.getTime() - OVERLAP_MS)
    : new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  let fetched;
  try {
    fetched = await sourceFor(query.platform).fetchNew(
      { query: query.query, section: query.section },
      since,
    );
  } catch (error) {
    await db
      .update(sourceQuery)
      .set({
        lastError: error instanceof Error ? error.message : String(error),
        lastErrorAt: now,
      })
      .where(eq(sourceQuery.id, queryId));
    throw error; // pg-boss retries with backoff
  }

  const [account] = await db
    .select({ handle: platformAccount.handle })
    .from(platformAccount)
    .where(
      and(
        eq(platformAccount.workspaceId, query.workspaceId),
        eq(platformAccount.platform, query.platform),
      ),
    );

  // One row per external id, even if the platform returned it twice.
  const unique = [...new Map(fetched.map((i) => [i.externalId, i])).values()];

  let inserted: { isNew: boolean; kept: boolean }[] = [];
  if (unique.length) {
    inserted = await db
      .insert(item)
      .values(
        unique.map((raw) => ({
          workspaceId: query.workspaceId,
          platform: query.platform,
          externalId: raw.externalId,
          type: raw.type,
          author: raw.author,
          title: raw.title,
          text: raw.text,
          url: raw.url,
          threadId: raw.threadId,
          postedAt: raw.createdAt,
          category: categorize(raw),
          filterStatus: prefilter(raw, { ownHandle: account?.handle }),
          matchedQueryIds: [query.id],
          raw: raw.raw,
        })),
      )
      .onConflictDoUpdate({
        target: [item.workspaceId, item.platform, item.externalId],
        set: {
          matchedQueryIds: sql`array(select distinct unnest(${item.matchedQueryIds} || excluded.matched_query_ids))`,
        },
      })
      .returning({
        // xmax = 0 means the row was inserted, not updated.
        isNew: sql<boolean>`(xmax = 0)`,
        kept: sql<boolean>`(${item.filterStatus} = 'kept')`,
      });
  }

  await db
    .update(sourceQuery)
    .set({ lastPolledAt: now, lastError: null, lastErrorAt: null })
    .where(eq(sourceQuery.id, queryId));

  const created = inserted.filter((r) => r.isNew);
  return {
    fetched: fetched.length,
    new: created.length,
    kept: created.filter((r) => r.kept).length,
  };
}

export async function enabledQueryIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: sourceQuery.id })
    .from(sourceQuery)
    .where(eq(sourceQuery.enabled, true));
  return rows.map((r) => r.id);
}
