// Input schemas shared by server actions (validation) and forms (limits).
import { z } from "zod";
import { KEYWORD_SECTIONS } from "@/llm/prompts/suggest-keywords";

export const PROFILE_LIMITS = {
  name: 80,
  description: 500,
  audience: 200,
  problem: 160,
  problems: 8,
} as const;

export const productProfileSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, "Give your product a name.")
    .max(PROFILE_LIMITS.name),
  productDescription: z
    .string()
    .trim()
    .min(10, "Describe what it does in a sentence or two.")
    .max(PROFILE_LIMITS.description),
  audience: z.string().trim().max(PROFILE_LIMITS.audience),
  problems: z
    .array(z.string().trim().max(PROFILE_LIMITS.problem))
    .transform((list) => list.filter(Boolean))
    .pipe(
      z
        .array(z.string())
        .min(1, "Add at least one problem your product solves.")
        .max(PROFILE_LIMITS.problems),
    ),
});
export type ProductProfileInput = z.input<typeof productProfileSchema>;

// HN usernames: 2–15 letters, digits, dashes or underscores.
export const hnHandleSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{2,15}$/, "That doesn't look like an HN username.");

export const SECTION_LABELS: Record<(typeof KEYWORD_SECTIONS)[number], string> =
  {
    ask_hn: "Ask HN posts",
    story_comment: "All stories and comments",
  };

// What each option searches, and what kind of keyword works there.
export const SECTION_HINTS: Record<
  (typeof KEYWORD_SECTIONS)[number],
  { hint: string; example: string }
> = {
  ask_hn: {
    hint: "Only questions people post as “Ask HN”. There are few, so one broad word works.",
    example: "e.g. customers",
  },
  story_comment: {
    hint: "Every post and comment on Hacker News, where most people mention being stuck. Use a specific phrase of 2 or 3 words.",
    example: "e.g. no paying customers",
  },
};

export const keywordSchema = z.object({
  query: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Keywords need at least 2 characters.")
    .max(40, "Keep keywords short: 1 to 3 words."),
  section: z.enum(KEYWORD_SECTIONS),
});
export type KeywordInput = z.infer<typeof keywordSchema>;

export const firstScanSchema = z.object({
  keywords: z
    .array(keywordSchema)
    .max(20)
    .refine(
      (list) =>
        new Set(list.map((k) => `${k.section}:${k.query}`)).size ===
        list.length,
      "Each keyword can only be listed once per section.",
    ),
  showHn: z.boolean(),
});
export type FirstScanInput = z.infer<typeof firstScanSchema>;

// One AI job's model (see src/llm/config.ts). Empty key or URL = keep the
// saved one, or use the server's.
export const aiJobSchema = z
  .object({
    job: z.enum(["sorting", "writing"]),
    provider: z.enum(["typesafe", "anthropic", "openai", "ollama"]),
    apiKey: z.string().trim().max(500, "That's too long for an API key."),
    baseUrl: z
      .union([
        z.literal(""),
        z.url("Enter a full URL, like http://ollama:11434/v1"),
      ])
      .transform((v) => v || null),
    model: z
      .string()
      .trim()
      .max(100)
      .transform((v) => v || null),
  })
  .refine((s) => s.job === "sorting" || s.provider !== "typesafe", {
    path: ["provider"],
    message: "TypeSafe Jev only sorts threads; pick an LLM for writing help.",
  })
  .refine(
    (s) => s.provider === "typesafe" || s.provider === "anthropic" || s.model,
    { path: ["model"], message: "Name the model to use with this provider." },
  );
export type AiJobInput = z.input<typeof aiJobSchema>;
