// The only entry point for model calls (see the llm-prompt skill). Picks the
// provider and model for the prompt's slot, validates the output against the
// prompt's schema and records every call in llm_call.
import { generateText, type LanguageModel, Output } from "ai";
import { db } from "@/db";
import { llmCall } from "@/db/schema";
import type { LlmConfig } from "./config";
import type { PromptDef } from "./prompt";
import { languageModel } from "./provider";
import { getLlmConfig } from "./settings";

export type StructuredResult<Output> = {
  output: Output;
  model: string;
  provider: LlmConfig["provider"];
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function generateStructured<Input, Output>(
  workspaceId: string,
  prompt: PromptDef<Input, Output>,
  input: Input,
  // Tests inject a config and/or an AI SDK mock model.
  options: { config?: LlmConfig; model?: LanguageModel } = {},
): Promise<StructuredResult<Output>> {
  const config = options.config ?? (await getLlmConfig(workspaceId));
  const modelId = config.models[prompt.slot];
  const started = Date.now();

  const record = (fields: {
    ok: boolean;
    inputTokens?: number | null;
    outputTokens?: number | null;
    error?: string;
  }) =>
    db.insert(llmCall).values({
      workspaceId,
      slot: prompt.slot,
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
      model: options.model ?? languageModel(config, prompt.slot),
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
