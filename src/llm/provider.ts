import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { LlmConfig } from "./config";
import type { ModelSlot } from "./prompt";

// Builds the AI SDK model for a slot. Not used in mock mode (see client.ts).
export function languageModel(
  config: LlmConfig,
  slot: ModelSlot,
): LanguageModel {
  const modelId = config.models[slot];
  switch (config.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })(
        modelId,
      );
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: config.baseUrl ?? "http://localhost:11434/v1",
      })(modelId);
    case "mock":
      throw new Error("The mock provider has no language model");
  }
}
