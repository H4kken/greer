import { z } from "zod";
import { definePrompt } from "../prompt";
import {
  type ItemForScoring,
  itemSection,
  type ProductProfile,
  productSection,
  UNTRUSTED_RULE,
} from "./shared";

export type ScoreLaunchInput = {
  product: ProductProfile;
  item: ItemForScoring;
};

const schema = z.object({
  asks_for_feedback: z
    .boolean()
    .describe("The maker explicitly asks for feedback, reactions or advice."),
  early_stage: z
    .boolean()
    .describe(
      "It is an early product (MVP, first launch, few or no users), not an established company.",
    ),
  maker_in_audience: z
    .boolean()
    .describe(
      "The maker fits the builder's audience (e.g. an indie developer or small team building their own product). Judge the maker, not their product's market: a consumer app by an indie developer can fit; a funded company or a hobby game by non-builders usually doesn't.",
    ),
  useful_feedback_possible: z
    .boolean()
    .describe(
      "A fellow builder could give concrete, useful feedback from the post alone.",
    ),
  reason: z
    .string()
    .describe(
      "One short line (max ~20 words): why giving feedback here is worthwhile, or not.",
    ),
});

export type ScoreLaunchOutput = z.infer<typeof schema>;

export const scoreLaunch = definePrompt<ScoreLaunchInput, ScoreLaunchOutput>({
  name: "score-launch",
  version: "score-launch-v2",
  slot: "fast",
  system: `You help a SaaS builder find Hacker News launch posts (Show HN) where genuine feedback from a fellow builder would be welcome and worthwhile. Answer the criteria precisely; the builder's software turns your answers into a score.

${UNTRUSTED_RULE}`,
  build: ({ product, item }) =>
    [productSection(product), "", itemSection(item)].join("\n"),
  schema,
  mock: ({ item }) => {
    const text = `${item.title} ${item.text}`.toLowerCase();
    const feedback = /feedback|thoughts|let me know|roast/.test(text);
    return {
      asks_for_feedback: feedback,
      early_stage: /\b(mvp|first|launched|beta|side project)\b/.test(text),
      maker_in_audience: true,
      useful_feedback_possible: true,
      reason: feedback
        ? "Maker asks for feedback on an early product."
        : "A launch without an explicit feedback request.",
    };
  },
});
