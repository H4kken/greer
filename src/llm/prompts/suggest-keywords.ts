import { z } from "zod";
import { definePrompt } from "../prompt";
import { type ProductProfile, productSection } from "./shared";

export type SuggestKeywordsInput = { product: ProductProfile };

// Where a keyword searches on HN (see HN_SECTIONS in src/sources/hn).
export const KEYWORD_SECTIONS = ["ask_hn", "story_comment"] as const;

const schema = z.object({
  keywords: z
    .array(
      z.object({
        query: z
          .string()
          .min(2)
          .max(40)
          .describe(
            "One to three lowercase words. Every word must appear in a matching post.",
          ),
        section: z
          .enum(KEYWORD_SECTIONS)
          .describe(
            "ask_hn: only Ask HN posts (people asking for help; broad words are fine). story_comment: all stories and comments (much noisier; needs specific phrases).",
          ),
        why: z
          .string()
          .max(100)
          .describe("A few words: which problem or situation it catches."),
      }),
    )
    .min(3)
    .max(8),
});

export type SuggestKeywordsOutput = z.infer<typeof schema>;

export const suggestKeywords = definePrompt<
  SuggestKeywordsInput,
  SuggestKeywordsOutput
>({
  name: "suggest-keywords",
  version: "suggest-keywords-v1",
  slot: "fast",
  system: `You help a SaaS builder choose Hacker News search keywords that find people facing the problems their product solves, so they can help them.

Search matches posts that contain every word of a keyword (Algolia, newest first). Suggest 5 to 8 keywords:
- Use the words people write when they describe their own struggle, not the product's marketing words or its category name.
- Prefer ask_hn with one broad word (e.g. "customers", "marketing"): Ask HN posts are few, and the scorer filters them later.
- Use story_comment only for specific phrases of two or three words (e.g. "first paying customers"): single words there return thousands of unrelated comments.
- Cover different problems from the list; no near-duplicates.`,
  build: ({ product }) => productSection(product),
  schema,
  // Deterministic stand-in: the longest word of each problem, in Ask HN.
  mock: ({ product }) => {
    const words = product.problems
      .map(
        (p) =>
          p
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .sort((a, b) => b.length - a.length)[0],
      )
      .filter((w): w is string => !!w && w.length >= 2);
    const unique = [...new Set([...words, "launch", "feedback", "customers"])];
    return {
      keywords: unique.slice(0, 5).map((query) => ({
        query,
        section: "ask_hn" as const,
        why: "From your problems",
      })),
    };
  },
});
