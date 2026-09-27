import { and, count, eq, gte, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { llmCall } from "@/db/schema";
import { estimateCostUsd } from "./pricing";

export type LlmUsage = {
  calls: number;
  // null when some calls used a model with no known price (e.g. local models).
  costUsd: number | null;
};

export async function llmUsageSince(
  db: Db,
  workspaceId: string,
  since: Date,
): Promise<LlmUsage> {
  const rows = await db
    .select({
      model: llmCall.model,
      calls: count(),
      inputTokens: sum(llmCall.inputTokens).mapWith(Number),
      outputTokens: sum(llmCall.outputTokens).mapWith(Number),
    })
    .from(llmCall)
    .where(
      and(eq(llmCall.workspaceId, workspaceId), gte(llmCall.createdAt, since)),
    )
    .groupBy(llmCall.model);

  let costUsd: number | null = 0;
  for (const row of rows) {
    const cost = estimateCostUsd(row.model, row.inputTokens, row.outputTokens);
    // Mock calls cost nothing; other unknown models make the total unknown.
    if (cost === null && !row.model.startsWith("mock-")) costUsd = null;
    else if (costUsd !== null) costUsd += cost ?? 0;
  }
  return { calls: rows.reduce((n, r) => n + r.calls, 0), costUsd };
}

export function llmUsageLastDays(
  db: Db,
  workspaceId: string,
  days: number,
): Promise<LlmUsage> {
  return llmUsageSince(
    db,
    workspaceId,
    new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  );
}

export function formatUsd(value: number): string {
  return value < 0.01 && value > 0 ? "< $0.01" : `$${value.toFixed(2)}`;
}
