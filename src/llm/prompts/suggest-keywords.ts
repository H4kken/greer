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
  show_hn: z.object({
    watch: z
      .boolean()
      .describe(
        "True only if the people who post Show HN launches (founders, developers, indie makers showing what they built) are part of the builder's audience.",
      ),
    why: z
      .string()
      .max(100)
      .describe("A few words: why launches fit this audience, or don't."),
  }),
});

export type SuggestKeywordsOutput = z.infer<typeof schema>;

export const suggestKeywords = definePrompt<
  SuggestKeywordsInput,
  SuggestKeywordsOutput
>({
  name: "suggest-keywords",
  version: "suggest-keywords-v3",
  job: "writing",
  system: `You help a SaaS builder choose Hacker News search keywords that find people facing the problems their product solves, so they can help them.

Search matches posts that contain every word of a keyword (Algolia, newest first). On Hacker News, few people start an Ask HN about their struggle; most mention it in a comment ("we launched three months ago and have 12 users"). Suggest 6 to 8 keywords:
- At least 4 story_comment phrases of two or three words, in the words people use about their own situation, first person: e.g. "no paying customers", "struggling to get users", "first 100 users", "zero signups". Single words there return thousands of unrelated comments.
- 2 or 3 ask_hn keywords with one broad word (e.g. "customers", "marketing"): Ask HN posts are few, and the scorer filters them later.
- Never the product's marketing words or its category name.
- Cover different problems from the list; no near-duplicates.

Also say whether to watch Show HN, where makers post what they built and ask for feedback: hundreds of launches a week. Watch it only if those makers are the builder's audience (e.g. a tool for indie founders or developers). For a product whose customers are not software makers (shops, agencies, consumers, a specific industry), don't: launches would bury the few people who matter.`,
  build: ({ product }) => productSection(product),
  schema,
  // Deterministic stand-in: the longest word of each problem in Ask HN, and
  // its last two words as a comment phrase.
  mock: ({ product }) => {
    const words = (p: string) =>
      p
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2);
    const broad = [
      ...new Set([
        ...product.problems.map(
          (p) => [...words(p)].sort((a, b) => b.length - a.length)[0],
        ),
        "launch",
        "feedback",
        "customers",
      ]),
    ].filter((w): w is string => !!w);
    const phrases = [
      ...new Set(
        product.problems
          .map((p) => words(p).slice(-2).join(" "))
          .filter((p) => p.includes(" ")),
      ),
    ];
    const builders =
      /founder|builder|developer|maker|indie|startup|saas|engineer/i.test(
        `${product.audience} ${product.description}`,
      );
    return {
      show_hn: {
        watch: builders,
        why: builders
          ? "Your audience builds products"
          : "Your audience doesn't build software",
      },
      keywords: [
        ...broad.slice(0, 3).map((query) => ({
          query,
          section: "ask_hn" as const,
          why: "From your problems",
        })),
        ...phrases.slice(0, 4).map((query) => ({
          query,
          section: "story_comment" as const,
          why: "How people mention it in comments",
        })),
      ],
    };
  },
});
