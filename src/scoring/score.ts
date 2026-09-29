import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore, llmCall, workspace } from "@/db/schema";
import { generateStructured } from "@/llm/client";
import {
  LlmNotConfiguredError,
  type ModelChoice,
  sortingFallback,
} from "@/llm/config";
import {
  askJev,
  helpQuestions,
  JEV_HELP_VERSION,
  JEV_LAUNCH_VERSION,
  JevError,
  jevHelpScore,
  jevLaunchScore,
  jevState,
  launchQuestions,
} from "@/llm/jev";
import { scoreHelp } from "@/llm/prompts/score-help";
import { scoreLaunch } from "@/llm/prompts/score-launch";
import type { ItemForScoring, ProductProfile } from "@/llm/prompts/shared";
import { getAiConfig } from "@/llm/settings";
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

  const itemIn = {
    type: row.item.type,
    title: row.item.title,
    text: row.item.text,
  };
  const { workspaceId, category } = row.item;
  const config = await getAiConfig(workspaceId);
  const sorting = config.sorting;
  if (!sorting) throw new LlmNotConfiguredError("sorting");
  let scored: Scored;
  if (sorting.provider === "typesafe") {
    try {
      scored = await scoreWithJev(
        db,
        workspaceId,
        sorting.apiKey!,
        category,
        product,
        itemIn,
      );
    } catch (error) {
      if (!(error instanceof JevError)) throw error;
      const fallback = sortingFallback(config);
      if (fallback) {
        console.warn(
          `[score] Jev failed, using ${fallback.provider}: ${error.message}`,
        );
        scored = await scoreWithLlm(
          workspaceId,
          fallback,
          category,
          product,
          itemIn,
        );
      } else if (error.badKey) {
        // Retrying won't help: wait for a new key, like with no key at all.
        throw new LlmNotConfiguredError(
          "sorting",
          "TypeSafe rejected the API key. Update it in Settings → AI.",
        );
      } else {
        throw error;
      }
    }
  } else {
    scored = await scoreWithLlm(
      workspaceId,
      sorting,
      category,
      product,
      itemIn,
    );
  }

  const values = {
    workspaceId,
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

type Scored = {
  score: number;
  criteriaMet: number;
  criteriaTotal: number;
  criteria: unknown;
  intent: string;
  reason: string;
  promptVersion: string;
  model: string;
};

async function scoreWithLlm(
  workspaceId: string,
  config: ModelChoice,
  category: "help" | "feedback",
  product: ProductProfile,
  itemIn: ItemForScoring,
): Promise<Scored> {
  const input = { product, item: itemIn };
  if (category === "feedback") {
    const r = await generateStructured(workspaceId, scoreLaunch, input, {
      config,
    });
    return {
      ...computeLaunchScore(r.output),
      criteria: r.output,
      intent: "sharing_launch",
      reason: r.output.reason,
      promptVersion: scoreLaunch.version,
      model: r.model,
    };
  }
  const r = await generateStructured(workspaceId, scoreHelp, input, {
    config,
  });
  return {
    ...computeHelpScore(r.output),
    criteria: r.output,
    intent: r.output.intent,
    reason: r.output.reason,
    promptVersion: scoreHelp.version,
    model: r.model,
  };
}

// Jev writes no reason line: the "why" checklist comes from the criteria.
// The raw probabilities are kept with them, for tuning the weights later.
async function scoreWithJev(
  db: Db,
  workspaceId: string,
  apiKey: string,
  category: "help" | "feedback",
  product: ProductProfile,
  itemIn: ItemForScoring,
): Promise<Scored> {
  const launch = category === "feedback";
  const promptVersion = launch ? JEV_LAUNCH_VERSION : JEV_HELP_VERSION;
  const started = Date.now();
  const record = (fields: {
    ok: boolean;
    model: string;
    inputTokens?: number;
    error?: string;
  }) =>
    db.insert(llmCall).values({
      workspaceId,
      slot: "sorting",
      provider: "typesafe",
      model: fields.model,
      promptName: launch ? "score-launch" : "score-help",
      promptVersion,
      inputTokens: fields.inputTokens ?? null,
      outputTokens: 0,
      durationMs: Date.now() - started,
      ok: fields.ok,
      error: fields.error?.slice(0, 500) ?? null,
    });

  let r;
  try {
    r = await askJev(
      apiKey,
      jevState(product, itemIn),
      launch ? launchQuestions() : helpQuestions(product),
    );
  } catch (error) {
    await record({
      ok: false,
      model: "jev-latest",
      error: (error as Error).message,
    });
    throw error;
  }
  await record({ ok: true, model: r.model, inputTokens: r.inputTokens });

  const probabilities = Object.fromEntries(
    Object.entries(r.answers).map(([k, a]) => [
      k,
      a.type === "noul" ? a.noul : a.probabilities,
    ]),
  );
  if (launch) {
    const { score, criteria } = jevLaunchScore(r.answers);
    const met = Object.values(criteria);
    return {
      score,
      criteriaMet: met.filter(Boolean).length,
      criteriaTotal: met.length,
      criteria: { ...criteria, probabilities },
      intent: "sharing_launch",
      reason: "",
      promptVersion,
      model: r.model,
    };
  }
  const { score, criteria } = jevHelpScore(r.answers, product.problems.length);
  const met = [
    criteria.own_situation,
    criteria.seeking_help,
    criteria.problem_match !== "none",
    criteria.specific,
    criteria.reply_welcome,
  ];
  return {
    score,
    criteriaMet: met.filter(Boolean).length,
    criteriaTotal: met.length,
    criteria: { ...criteria, probabilities },
    intent: criteria.intent,
    reason: "",
    promptVersion,
    model: r.model,
  };
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
