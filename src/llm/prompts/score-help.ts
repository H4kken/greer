import { z } from "zod";
import { definePrompt } from "../prompt";
import {
  type ItemForScoring,
  itemSection,
  type ProductProfile,
  productSection,
  UNTRUSTED_RULE,
} from "./shared";

export type ScoreHelpInput = { product: ProductProfile; item: ItemForScoring };

const schema = z.object({
  own_situation: z
    .boolean()
    .describe(
      "The author has their own product, project or career at stake, even if the question is phrased generally. False for news, opinions and general topics.",
    ),
  seeking_help: z
    .boolean()
    .describe(
      "The author asks for help, advice or feedback (explicitly or clearly implied).",
    ),
  problem_match: z
    .enum(["none", "weak", "clear", "strong"])
    .describe(
      "How directly the author's situation matches one of the builder's problems.",
    ),
  matched_problem: z
    .number()
    .int()
    .nullable()
    .describe(
      "Number of the best matching problem from the list, or null if none.",
    ),
  specific: z
    .boolean()
    .describe(
      "The post gives concrete details (their product, numbers, what they already tried), enough for a specific answer rather than generic advice.",
    ),
  reply_welcome: z
    .boolean()
    .describe(
      "A thoughtful reply from a fellow builder would be welcome (not hostile, resolved or rhetorical).",
    ),
  intent: z.enum([
    "asking_for_help",
    "describing_pain",
    "sharing_launch",
    "discussion",
    "other",
  ]),
  reason: z
    .string()
    .describe(
      "One short line (max ~20 words): why this matters, or why not, for the builder.",
    ),
});

export type ScoreHelpOutput = z.infer<typeof schema>;

export const scoreHelp = definePrompt<ScoreHelpInput, ScoreHelpOutput>({
  name: "score-help",
  version: "score-help-v2",
  job: "sorting",
  system: `You help a SaaS builder find Hacker News conversations where they could genuinely help someone, as a real person. For one post or comment, answer the criteria precisely; the builder's software turns your answers into a score.

Judge the person's actual situation, not keyword matches: "first users" of a programming language, or a news story about a company, is not a match. A strong match is someone personally facing one of the builder's problems right now. Most good conversations are ones where the builder simply helps, without mentioning their product.

${UNTRUSTED_RULE}`,
  build: ({ product, item }) =>
    [productSection(product), "", itemSection(item)].join("\n"),
  schema,
  // Deterministic stand-in for tests and demos: crude keyword heuristics.
  mock: ({ product, item }) => {
    const text = `${item.title} ${item.text}`.toLowerCase();
    const matched = product.problems.findIndex((p) =>
      p
        .toLowerCase()
        .split(/\W+/)
        .some((word) => word.length > 5 && text.includes(word)),
    );
    const seeking = text.includes("?");
    return {
      own_situation: /\b(i|my|we|our)\b/.test(text),
      seeking_help: seeking,
      problem_match: matched >= 0 ? "clear" : "none",
      matched_problem: matched >= 0 ? matched + 1 : null,
      specific: item.text.length > 200,
      reply_welcome: true,
      intent: seeking ? "asking_for_help" : "discussion",
      reason:
        matched >= 0
          ? `Mentions: ${product.problems[matched]}`
          : "No clear match with your problems.",
    };
  },
});
