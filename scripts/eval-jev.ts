// Compares the LLM scorer (fast slot, e.g. Haiku) with TypeSafe's Jev.
// Usage: pnpm eval jev [--threshold 60] [--no-real] [--limit 300]
//
// 1. Labeled set (scoring.json): both models live, one case at a time, for
//    accuracy, ranking quality, speed and cost.
// 2. Real threads already scored in DATABASE_URL: Jev only, compared with
//    the stored LLM scores (agreement, not accuracy: there are no labels).
//
// Needs TYPESAFE_API_KEY and an LLM key. Nothing is written to the database.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { generateStructured } from "@/llm/client";
import { envChoice, llmSortingChoice } from "@/llm/config";
import { evalMetrics, rankAuc } from "@/llm/eval";
import {
  askJev,
  helpQuestions,
  JEV_PRICE_PER_MTOK,
  jevHelpScore,
  jevLaunchScore,
  jevState,
  launchQuestions,
} from "@/llm/jev";
import { estimateCostUsd } from "@/llm/pricing";
import { scoreHelp } from "@/llm/prompts/score-help";
import { scoreLaunch } from "@/llm/prompts/score-launch";
import type { ItemForScoring, ProductProfile } from "@/llm/prompts/shared";
import { computeHelpScore, computeLaunchScore } from "@/scoring/compute";

const { values } = parseArgs({
  options: {
    threshold: { type: "string", default: "60" },
    "no-real": { type: "boolean", default: false },
    limit: { type: "string", default: "300" },
  },
  allowPositionals: true,
});
const threshold = Number(values.threshold);
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  console.error("Set TYPESAFE_API_KEY (from console.typesafe.ai).");
  process.exit(1);
}

type Category = "help" | "feedback";

async function jevScore(
  category: Category,
  product: ProductProfile,
  item: ItemForScoring,
) {
  const state = jevState(product, item);
  if (category === "feedback") {
    const r = await askJev(apiKey!, state, launchQuestions());
    return { ...r, ...jevLaunchScore(r.answers) };
  }
  const r = await askJev(apiKey!, state, helpQuestions(product));
  return { ...r, ...jevHelpScore(r.answers, product.problems.length) };
}

const llmConfig = envChoice("sorting", process.env, llmSortingChoice);
async function llmScore(
  category: Category,
  product: ProductProfile,
  item: ItemForScoring,
) {
  const started = Date.now();
  const opts = { config: llmConfig, record: false };
  const input = { product, item };
  const r =
    category === "feedback"
      ? await generateStructured("eval", scoreLaunch, input, opts).then(
          (r) => ({ ...r, score: computeLaunchScore(r.output).score }),
        )
      : await generateStructured("eval", scoreHelp, input, opts).then((r) => ({
          ...r,
          score: computeHelpScore(r.output).score,
        }));
  return {
    score: r.score,
    model: r.model,
    criteria: r.output,
    ms: Date.now() - started,
    cost: estimateCostUsd(r.model, r.inputTokens, r.outputTokens) ?? 0,
  };
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
const jevCost = (tokens: number) => (tokens * JEV_PRICE_PER_MTOK) / 1_000_000;
const money = (usd: number) => `$${usd.toFixed(5)}`;

// ---- 1. Labeled set -------------------------------------------------------

type Case = ItemForScoring & {
  id: string;
  category: Category;
  expected: "yes" | "no" | "maybe";
  note: string;
};
const set = JSON.parse(
  readFileSync("src/llm/prompts/__evals__/scoring.json", "utf8"),
) as { product: ProductProfile; cases: Case[] };

console.log(`Labeled set: ${set.cases.length} cases\n`);
console.log("  LLM  Jev  label  category  title");
const labeled: (Case & {
  llm: Awaited<ReturnType<typeof llmScore>>;
  jev: Awaited<ReturnType<typeof jevScore>>;
})[] = [];
for (const c of set.cases) {
  const item = { type: c.type, title: c.title, text: c.text };
  const llm = await llmScore(c.category, set.product, item);
  const jev = await jevScore(c.category, set.product, item);
  labeled.push({ ...c, llm, jev });
  const wrong = (s: number) =>
    (c.expected === "yes" && s < threshold) ||
    (c.expected === "no" && s >= threshold);
  const mark = (s: number) => (wrong(s) ? "✗" : " ");
  console.log(
    `${mark(llm.score)}${String(llm.score).padStart(3)} ${mark(jev.score)}${String(jev.score).padStart(3)}  ${c.expected.padEnd(5)}  ${c.category.padEnd(8)}  ${c.title.slice(0, 60)}`,
  );
}

const side = (pick: (r: (typeof labeled)[number]) => number) => {
  const outcomes = labeled.map((r) => ({
    expected: r.expected,
    score: pick(r),
  }));
  const m = evalMetrics(outcomes, threshold);
  return {
    precision: m.precision,
    recall: m.recall,
    falsePositives: m.falsePositives,
    falseNegatives: m.falseNegatives,
    rankAuc: rankAuc(outcomes),
    distinctScores: m.distinctScores,
    tiedInTop10: m.tiedInTop10,
  };
};
const labeledSummary = {
  threshold,
  llm: {
    model: labeled[0]?.llm.model,
    ...side((r) => r.llm.score),
    msP50: pct(
      labeled.map((r) => r.llm.ms),
      0.5,
    ),
    msP90: pct(
      labeled.map((r) => r.llm.ms),
      0.9,
    ),
    costPerItem: labeled.reduce((s, r) => s + r.llm.cost, 0) / labeled.length,
  },
  jev: {
    model: labeled[0]?.jev.model,
    ...side((r) => r.jev.score),
    msP50: pct(
      labeled.map((r) => r.jev.ms),
      0.5,
    ),
    msP90: pct(
      labeled.map((r) => r.jev.ms),
      0.9,
    ),
    costPerItem:
      labeled.reduce((s, r) => s + jevCost(r.jev.inputTokens), 0) /
      labeled.length,
  },
};
console.log("\n", JSON.stringify(labeledSummary, null, 2));

// ---- 2. Real threads from the database -----------------------------------

let real: unknown = null;
if (!values["no-real"] && process.env.DATABASE_URL) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{
    id: string;
    type: "story" | "comment";
    category: Category;
    title: string;
    text: string;
    score: number;
    model: string;
    name: string;
    description: string;
    audience: string | null;
    problems: string[];
  }>(
    `select i.id, i.type, i.category, i.title, i.text, s.score, s.model,
            w.product_name as name, w.product_description as description, w.audience, w.problems
       from item i
       join item_score s on s.item_id = i.id
       join workspace w on w.id = i.workspace_id
      where i.filter_status = 'kept' and s.model not like 'mock%'
      order by i.posted_at desc
      limit $1`,
    [Number(values.limit)],
  );
  await client.end();

  console.log(`\nReal threads: ${rows.length} (Jev vs stored LLM scores)`);
  const out: {
    id: string;
    category: Category;
    title: string;
    llm: number;
    jev: number;
    ms: number;
    tokens: number;
  }[] = [];
  let failed = 0;
  // A few requests at a time, well under the rate limit.
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const product = {
          name: row.name,
          description: row.description,
          audience: row.audience ?? "",
          problems: row.problems,
        };
        try {
          const j = await jevScore(row.category, product, {
            type: row.type,
            title: row.title,
            text: row.text,
          });
          out.push({
            id: row.id,
            category: row.category,
            title: row.title,
            llm: row.score,
            jev: j.score,
            ms: j.ms,
            tokens: j.inputTokens,
          });
        } catch (e) {
          failed++;
          console.error(`  failed ${row.id}: ${(e as Error).message}`);
        }
        if (out.length % 25 === 0) process.stdout.write(`  ${out.length}…`);
      }
    }),
  );

  const both = out.filter((r) => r.llm >= threshold && r.jev >= threshold);
  const llmOnly = out.filter((r) => r.llm >= threshold && r.jev < threshold);
  const jevOnly = out.filter((r) => r.llm < threshold && r.jev >= threshold);
  const rank = (xs: number[]) => {
    const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(xs.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
      for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const pearson = (a: number[], b: number[]) => {
    const ma = a.reduce((s, x) => s + x, 0) / a.length;
    const mb = b.reduce((s, x) => s + x, 0) / b.length;
    let num = 0;
    let da = 0;
    let db = 0;
    a.forEach((x, i) => {
      num += (x - ma) * (b[i]! - mb);
      da += (x - ma) ** 2;
      db += (b[i]! - mb) ** 2;
    });
    return num / Math.sqrt(da * db);
  };
  const tokens = out.reduce((s, r) => s + r.tokens, 0);
  real = {
    threads: out.length,
    failed,
    agreementAtThreshold:
      (out.length - llmOnly.length - jevOnly.length) / out.length,
    surfacedByBoth: both.length,
    surfacedByLlmOnly: llmOnly.length,
    surfacedByJevOnly: jevOnly.length,
    rankCorrelation: pearson(
      rank(out.map((r) => r.llm)),
      rank(out.map((r) => r.jev)),
    ),
    jevMsP50: pct(
      out.map((r) => r.ms),
      0.5,
    ),
    jevMsP90: pct(
      out.map((r) => r.ms),
      0.9,
    ),
    jevCostTotal: jevCost(tokens),
    // Biggest disagreements, to read by hand.
    llmOnlyExamples: llmOnly
      .sort((a, b) => b.llm - b.jev - (a.llm - a.jev))
      .slice(0, 8)
      .map((r) => `${r.llm}/${r.jev} ${r.category} ${r.title}`),
    jevOnlyExamples: jevOnly
      .sort((a, b) => b.jev - b.llm - (a.jev - a.llm))
      .slice(0, 8)
      .map((r) => `${r.llm}/${r.jev} ${r.category} ${r.title}`),
  };
  console.log("\n", JSON.stringify(real, null, 2));
  real = { ...(real as object), rows: out };
}

console.log(
  `\nPer thread: LLM ${money(labeledSummary.llm.costPerItem)} vs Jev ${money(labeledSummary.jev.costPerItem)}`,
);
mkdirSync("eval-results", { recursive: true });
const file = `eval-results/jev-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(file, JSON.stringify({ labeledSummary, labeled, real }, null, 2));
console.log(`Details: ${file}`);
process.exit(0);
