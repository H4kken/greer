// Runs the classify-answer prompt on its eval set against a real model and
// reports accuracy per tone. Usage: pnpm eval classify-answer
// Needs an LLM key in the environment. Nothing is written to the database.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateStructured } from "@/llm/client";
import { resolveLlmConfig } from "@/llm/config";
import { estimateCostUsd } from "@/llm/pricing";
import { classifyAnswer } from "@/llm/prompts/classify-answer";
import { type AnswerTone, toneOf } from "@/replies/classify";

type Case = {
  id: string;
  threadTitle: string;
  reply: string;
  answer: string;
  expected: AnswerTone;
};
const set = JSON.parse(
  readFileSync("src/llm/prompts/__evals__/classify-answer.json", "utf8"),
) as { cases: Case[] };

const config = resolveLlmConfig(null, process.env);
let cost = 0;
const results = [];
for (const c of set.cases) {
  const r = await generateStructured("eval", classifyAnswer, c, {
    config,
    record: false,
  });
  cost += estimateCostUsd(r.model, r.inputTokens, r.outputTokens) ?? 0;
  const tone = toneOf(r.output);
  results.push({ ...c, tone, output: r.output, model: r.model });
  console.log(
    `${tone === c.expected ? " " : "✗"} ${c.expected.padEnd(12)} ${tone.padEnd(12)} ${c.id}`,
  );
}

const correct = results.filter((r) => r.tone === r.expected).length;
console.log(
  "\n",
  JSON.stringify(
    {
      version: classifyAnswer.version,
      model: results[0]?.model,
      costUsd: Number(cost.toFixed(4)),
      accuracy: Number((correct / results.length).toFixed(3)),
      correct,
      total: results.length,
    },
    null,
    2,
  ),
);
mkdirSync("eval-results", { recursive: true });
const file = `eval-results/classify-answer-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(`\nDetails: ${file}`);
