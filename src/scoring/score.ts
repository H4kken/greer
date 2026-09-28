import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore, workspace } from "@/db/schema";
import { generateStructured } from "@/llm/client";
import { scoreHelp } from "@/llm/prompts/score-help";
import { scoreLaunch } from "@/llm/prompts/score-launch";
import type { ProductProfile } from "@/llm/prompts/shared";
import { computeHelpScore, computeLaunchScore } from "./compute";

export type ScoreOutcome =
  | { status: "scored"; score: number }
  | {
      status: "skipped";
      reason: "not_found" | "filtered" | "no_product_profile";
    };

export function productProfileOf(
  ws: typeof workspace.$inferSelect,
): ProductProfile | null {
  if (!ws.productName || !ws.productDescription || ws.problems.length === 0) {
    return null;
  }
  return {
    name: ws.productName,
    description: ws.productDescription,
    audience: ws.audience ?? "",
    problems: ws.problems,
  };
}

// Scores one item (again, if it was scored before) and stores the result.
export async function scoreItem(db: Db, itemId: string): Promise<ScoreOutcome> {
  const [row] = await db
    .select({ item, workspace })
    .from(item)
    .innerJoin(workspace, eq(workspace.id, item.workspaceId))
    .where(eq(item.id, itemId));
  if (!row) return { status: "skipped", reason: "not_found" };
  if (row.item.filterStatus !== "kept")
    return { status: "skipped", reason: "filtered" };
  const product = productProfileOf(row.workspace);
  if (!product) return { status: "skipped", reason: "no_product_profile" };

  const input = {
    product,
    item: { type: row.item.type, title: row.item.title, text: row.item.text },
  };
  const scored =
    row.item.category === "feedback"
      ? await (async () => {
          const r = await generateStructured(
            row.item.workspaceId,
            scoreLaunch,
            input,
          );
          return {
            ...computeLaunchScore(r.output),
            criteria: r.output,
            intent: "sharing_launch",
            reason: r.output.reason,
            promptVersion: scoreLaunch.version,
            model: r.model,
          };
        })()
      : await (async () => {
          const r = await generateStructured(
            row.item.workspaceId,
            scoreHelp,
            input,
          );
          return {
            ...computeHelpScore(r.output),
            criteria: r.output,
            intent: r.output.intent,
            reason: r.output.reason,
            promptVersion: scoreHelp.version,
            model: r.model,
          };
        })();

  const values = {
    workspaceId: row.item.workspaceId,
    ...scored,
    reason: scored.reason.slice(0, 300),
    scoredAt: new Date(),
  };
  await db
    .insert(itemScore)
    .values({ itemId, ...values })
    .onConflictDoUpdate({ target: itemScore.itemId, set: values });
  return { status: "scored", score: scored.score };
}

// Kept items with no score yet, in workspaces that can be scored. Used by the
// periodic sweep, so items missed by a crash or an API outage get scored later,
// and for one workspace right after its AI model is set up.
export async function unscoredItemIds(
  db: Db,
  { workspaceId, limit = 200 }: { workspaceId?: string; limit?: number } = {},
): Promise<string[]> {
  const rows = await db
    .select({ id: item.id })
    .from(item)
    .innerJoin(workspace, eq(workspace.id, item.workspaceId))
    .leftJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(
      and(
        eq(item.filterStatus, "kept"),
        isNull(itemScore.itemId),
        workspaceId ? eq(item.workspaceId, workspaceId) : undefined,
        sql`${workspace.productName} is not null and cardinality(${workspace.problems}) > 0`,
      ),
    )
    .orderBy(desc(item.postedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}
