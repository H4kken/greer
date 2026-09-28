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

export const jevKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, "Paste your TypeSafe API key.")
    .max(500, "That's too long for an API key."),
});

export const llmSettingsSchema = z
  .object({
    provider: z.enum(["anthropic", "openai", "ollama"]),
    // Empty = keep the saved key.
    apiKey: z.string().trim().max(500),
    baseUrl: z
      .union([
        z.literal(""),
        z.url("Enter a full URL, like http://ollama:11434/v1"),
      ])
      .transform((v) => v || null),
    fastModel: z
      .string()
      .trim()
      .max(100)
      .transform((v) => v || null),
    qualityModel: z
      .string()
      .trim()
      .max(100)
      .transform((v) => v || null),
  })
  .refine((s) => s.provider !== "ollama" || s.baseUrl, {
    path: ["baseUrl"],
    message: "Ollama needs the server URL.",
  })
  .refine(
    (s) => s.provider === "anthropic" || (s.fastModel && s.qualityModel),
    {
      path: ["fastModel"],
      message: "Name both models for this provider.",
    },
  );
export type LlmSettingsInput = z.input<typeof llmSettingsSchema>;
