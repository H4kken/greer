import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore, sourceQuery, workspace } from "@/db/schema";
import { type LlmUsage, llmUsageSince } from "@/llm/usage";
import { syncHnQueries } from "@/workspace/keywords";
import type { FirstScanInput } from "@/workspace/schemas";

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

export type ScanProgress = {
  queries: { total: number; finished: number; failed: number };
  found: number;
  kept: number;
  scored: number;
  usage: LlmUsage;
  top: {
    id: string;
    title: string;
    url: string;
    category: "help" | "feedback";
    score: number;
    criteriaMet: number;
    criteriaTotal: number;
    reason: string;
  }[];
};

export async function getScanProgress(
  db: Db,
  workspaceId: string,
  since: Date,
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
    .where(eq(itemScore.workspaceId, workspaceId))
    .orderBy(desc(itemScore.score), desc(item.postedAt))
    .limit(3);

  return {
    queries: queries ?? { total: 0, finished: 0, failed: 0 },
    found: items?.found ?? 0,
    kept: items?.kept ?? 0,
    scored: items?.scored ?? 0,
    usage: await llmUsageSince(db, workspaceId, since),
    top,
  };
}

// Done when every query ran once and every kept item has a score.
export function scanDone(p: ScanProgress): boolean {
  return (
    p.queries.total > 0 &&
    p.queries.finished >= p.queries.total &&
    p.scored >= p.kept
  );
}
