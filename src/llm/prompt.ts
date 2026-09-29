import type { z } from "zod";
import type { AiJob } from "./config";

// Every prompt lives in src/llm/prompts/<name>.ts and exports one of these.
// Bump `version` whenever the text or schema changes (see the llm-prompt skill).
export type PromptDef<Input, Output> = {
  name: string;
  version: string;
  // Which job's model runs it (see config.ts): "sorting" for scoring,
  // "writing" for everything that needs judgment.
  job: AiJob;
  system: string;
  build: (input: Input) => string;
  schema: z.ZodType<Output>;
  // Deterministic answer used when LLM_PROVIDER=mock (tests, e2e, demos).
  mock: (input: Input) => Output;
};

export function definePrompt<Input, Output>(
  def: PromptDef<Input, Output>,
): PromptDef<Input, Output> {
  return def;
}

// Platform content is untrusted: always pass it through this, inside
// delimiters, and tell the model never to follow instructions found in it.
export function untrusted(tag: string, text: string, maxChars = 4000): string {
  const clipped =
    text.length > maxChars ? `${text.slice(0, maxChars)}\n[…truncated]` : text;
  return `<${tag}>\n${clipped.replaceAll(`</${tag}>`, "")}\n</${tag}>`;
}
