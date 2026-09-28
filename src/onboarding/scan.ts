import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore, sourceQuery, workspace } from "@/db/schema";
import { MIN_SCORE } from "@/today/queries";
import { syncHnQueries } from "@/workspace/keywords";
import type { FirstScanInput } from "@/workspace/schemas";
import type { ScanProgress } from "./scan-copy";

export { type ScanProgress, scanDone } from "./scan-copy";

// Saves the chosen queries and marks onboarding done, in one transaction.
// Returns the enabled query ids so the caller can poll them right away.
export async function startFirstScan(
  db: Db,
  workspaceId: string,
  input: FirstScanInput,
  now = new Date(),
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const ids = await syncHnQueries(
      tx,
      workspaceId,
      input.keywords,
      input.showHn,
    );
    await tx
      .update(workspace)
      .set({ onboardedAt: sql`coalesce(${workspace.onboardedAt}, ${now})` })
      .where(eq(workspace.id, workspaceId));
    return ids;
  });
}

export async function getScanProgress(
  db: Db,
  workspaceId: string,
): Promise<ScanProgress> {
  const [queries] = await db
    .select({
      total: count(),
      // Polled at least once, or failed (and pg-boss is retrying).
      finished: count(
        sql`case when ${sourceQuery.lastPolledAt} is not null or ${sourceQuery.lastError} is not null then 1 end`,
      ),
      failed: count(sourceQuery.lastError),
    })
    .from(sourceQuery)
    .where(
      and(
        eq(sourceQuery.workspaceId, workspaceId),
        eq(sourceQuery.enabled, true),
      ),
    );

  const [items] = await db
    .select({
      found: count(),
      kept: count(sql`case when ${item.filterStatus} = 'kept' then 1 end`),
      scored: count(itemScore.itemId),
    })
    .from(item)
    .leftJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(eq(item.workspaceId, workspaceId));

  const worthIt = and(
    eq(itemScore.workspaceId, workspaceId),
    gte(itemScore.score, MIN_SCORE),
  );
  const [people] = await db
    .select({ n: countDistinct(item.author) })
    .from(itemScore)
    .innerJoin(item, eq(item.id, itemScore.itemId))
    .where(worthIt);

  const top = await db
    .select({
      id: item.id,
      title: item.title,
      url: item.url,
      category: item.category,
      score: itemScore.score,
      criteriaMet: itemScore.criteriaMet,
      criteriaTotal: itemScore.criteriaTotal,
      reason: itemScore.reason,
    })
    .from(itemScore)
    .innerJoin(item, eq(item.id, itemScore.itemId))
    .where(worthIt)
    .orderBy(desc(itemScore.score), desc(item.postedAt))
    .limit(3);

  return {
    queries: queries ?? { total: 0, finished: 0, failed: 0 },
    found: items?.found ?? 0,
    kept: items?.kept ?? 0,
    scored: items?.scored ?? 0,
    people: people?.n ?? 0,
    top,
  };
}
