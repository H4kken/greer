// Runs the topic-of-reply prompt on its eval set against a real model: does
// it reuse the right existing topic, and create a new one only when none
// fits? Usage: pnpm eval topic-of-reply. Nothing is written to the database.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateStructured } from "@/llm/client";
import { envChoice } from "@/llm/config";
import { estimateCostUsd } from "@/llm/pricing";
import { topicOfReply } from "@/llm/prompts/topic-of-reply";
import { normalizeTopic } from "@/replies/topics";

type Case = {
  id: string;
  threadTitle: string;
  reply: string;
  topics: string[];
  expected: { reuse: string | null; like?: string[] };
};
const set = JSON.parse(
  readFileSync("src/llm/prompts/__evals__/topic-of-reply.json", "utf8"),
) as { cases: Case[] };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const config = envChoice("writing", process.env);
let cost = 0;
const results = [];
for (const c of set.cases) {
  const r = await generateStructured("eval", topicOfReply, c, {
    config,
    record: false,
  });
  cost += estimateCostUsd(r.model, r.inputTokens, r.outputTokens) ?? 0;
  const name = normalizeTopic(r.output.topic);
  const ok = c.expected.reuse
    ? same(name, c.expected.reuse)
    : !c.topics.some((t) => same(t, name));
  results.push({ ...c, name, ok, model: r.model });
  console.log(
    `${ok ? " " : "✗"} ${(c.expected.reuse ?? "(new)").padEnd(22)} ${name.padEnd(22)} ${c.id}`,
  );
}

const correct = results.filter((r) => r.ok).length;
console.log(
  "\n",
  JSON.stringify(
    {
      version: topicOfReply.version,
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
const file = `eval-results/topic-of-reply-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(file, JSON.stringify(results, null, 2));
console.log(`\nDetails: ${file}`);
