// The only entry point for LLM calls (see the llm-prompt skill). Picks the
// model set for the prompt's job, validates the output against the prompt's
// schema and records every call in llm_call.
import { generateText, type LanguageModel, Output } from "ai";
import { db } from "@/db";
import { llmCall } from "@/db/schema";
import { LlmNotConfiguredError, type ModelChoice } from "./config";
import type { PromptDef } from "./prompt";
import { languageModel } from "./provider";
import { getAiConfig } from "./settings";

export type StructuredResult<Output> = {
  output: Output;
  model: string;
  provider: ModelChoice["provider"];
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function generateStructured<Input, Output>(
  workspaceId: string,
  prompt: PromptDef<Input, Output>,
  input: Input,
  // Scoring passes the model it picked (e.g. the fallback when Jev fails);
  // tests inject an AI SDK mock model; evals skip recording.
  options: {
    config?: ModelChoice;
    model?: LanguageModel;
    record?: boolean;
  } = {},
): Promise<StructuredResult<Output>> {
  const config = options.config ?? (await getAiConfig(workspaceId))[prompt.job];
  if (!config) throw new LlmNotConfiguredError(prompt.job);
  if (config.provider === "typesafe") {
    throw new Error(`TypeSafe can't run the ${prompt.name} prompt`);
  }
  const modelId = config.model;
  const started = Date.now();

  const record = async (fields: {
    ok: boolean;
    inputTokens?: number | null;
    outputTokens?: number | null;
    error?: string;
  }) => {
    if (options.record === false) return;
    await db.insert(llmCall).values({
      workspaceId,
      slot: prompt.job, // the column predates jobs; values: sorting, writing
      provider: config.provider,
      model: modelId,
      promptName: prompt.name,
      promptVersion: prompt.version,
      inputTokens: fields.inputTokens ?? null,
      outputTokens: fields.outputTokens ?? null,
      durationMs: Date.now() - started,
      ok: fields.ok,
      error: fields.error ?? null,
    });
  };

  if (config.provider === "mock" && !options.model) {
    const output = prompt.schema.parse(prompt.mock(input));
    await record({ ok: true, inputTokens: 0, outputTokens: 0 });
    return {
      output,
      model: modelId,
      provider: "mock",
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  try {
    const result = await generateText({
      model: options.model ?? languageModel(config),
      system: prompt.system,
      prompt: prompt.build(input),
      output: Output.object({ schema: prompt.schema }),
    });
    const inputTokens = result.usage.inputTokens ?? null;
    const outputTokens = result.usage.outputTokens ?? null;
    await record({ ok: true, inputTokens, outputTokens });
    return {
      output: result.output as Output,
      model: modelId,
      provider: config.provider,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    await record({
      ok: false,
      error:
        error instanceof Error ? error.message.slice(0, 500) : String(error),
    });
    throw error;
  }
}

// A tiny call made before saving a job's model, so a wrong key or model name
// is caught in the form rather than by the worker later.
export async function checkConnection(
  choice: ModelChoice,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (choice.provider === "mock" || choice.provider === "typesafe") {
    return { ok: true }; // TypeSafe keys are checked with checkJevKey
  }
  try {
    await generateText({
      model: languageModel(choice),
      prompt: "Reply with the word OK.",
      maxOutputTokens: 5,
      maxRetries: 0,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `${choice.model}: ${message.slice(0, 200)}` };
  }
}
