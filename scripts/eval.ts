// Runs the scoring prompts on the eval set against a real model and reports
// precision/recall and score spread. Usage: pnpm eval [--threshold 60]
// Other prompts: pnpm eval classify-answer | topic-of-reply
// Needs an LLM key in the environment (e.g. ANTHROPIC_API_KEY). Nothing is
// written to the database.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { generateStructured } from "@/llm/client";
import { resolveLlmConfig } from "@/llm/config";
import { evalMetrics } from "@/llm/eval";
import { estimateCostUsd } from "@/llm/pricing";
import { scoreHelp } from "@/llm/prompts/score-help";
import { scoreLaunch } from "@/llm/prompts/score-launch";
import { computeHelpScore, computeLaunchScore } from "@/scoring/compute";

const { values, positionals } = parseArgs({
  options: { threshold: { type: "string", default: "60" } },
  allowPositionals: true,
});
const threshold = Number(values.threshold);

// `pnpm eval classify-answer` runs that prompt's set instead of scoring.
if (positionals[0] === "classify-answer") {
  await import("./eval-classify-answer");
  process.exit(0);
}
if (positionals[0] === "topic-of-reply") {
  await import("./eval-topic-of-reply");
  process.exit(0);
}

type Case = {
  id: string;
  category: "help" | "feedback";
  type: "story" | "comment";
  title: string;
  text: string;
  expected: "yes" | "no" | "maybe";
  note: string;
};
const set = JSON.parse(
  readFileSync("src/llm/prompts/__evals__/scoring.json", "utf8"),
) as {
  product: {
    name: string;
    description: string;
    audience: string;
    problems: string[];
  };
  cases: Case[];
};

const config = resolveLlmConfig(null, process.env);
let cost = 0;
const results = [];
for (const c of set.cases) {
  const input = {
    product: set.product,
    item: { type: c.type, title: c.title, text: c.text },
  };
  const opts = { config, record: false };
  const { score, criteria, model, inputTokens, outputTokens } =
    c.category === "feedback"
      ? await generateStructured("eval", scoreLaunch, input, opts).then(
          (r) => ({
            ...r,
            score: computeLaunchScore(r.output).score,
            criteria: r.output,
          }),
        )
      : await generateStructured("eval", scoreHelp, input, opts).then((r) => ({
          ...r,
          score: computeHelpScore(r.output).score,
          criteria: r.output,
        }));
  cost += estimateCostUsd(model, inputTokens, outputTokens) ?? 0;
  results.push({ ...c, score, criteria, model });
  const miss =
    (c.expected === "yes" && score < threshold) ||
    (c.expected === "no" && score >= threshold);
  console.log(
    `${miss ? "✗" : " "} ${String(score).padStart(3)}  ${c.expected.padEnd(5)} ${c.category.padEnd(8)} ${c.title.slice(0, 70)}`,
  );
}

const metrics = {
  all: evalMetrics(results, threshold),
  help: evalMetrics(
    results.filter((r) => r.category === "help"),
    threshold,
  ),
  feedback: evalMetrics(
    results.filter((r) => r.category === "feedback"),
    threshold,
  ),
};
console.log(
  "\n",
  JSON.stringify(
    {
      versions: [scoreHelp.version, scoreLaunch.version],
      model: results[0]?.model,
      costUsd: Number(cost.toFixed(4)),
      metrics,
    },
    null,
    2,
  ),
);

mkdirSync("eval-results", { recursive: true });
const file = `eval-results/scoring-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(file, JSON.stringify({ threshold, metrics, results }, null, 2));
console.log(`\nDetails: ${file}`);
process.exit(0);
