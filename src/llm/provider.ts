import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelChoice } from "./config";

// Builds the AI SDK model for a job's choice. Not used for TypeSafe (not an
// LLM, see jev.ts) or in mock mode (see client.ts).
export function languageModel(choice: ModelChoice): LanguageModel {
  switch (choice.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: choice.apiKey })(choice.model);
    case "openai":
      return createOpenAI({ apiKey: choice.apiKey, baseURL: choice.baseUrl })(
        choice.model,
      );
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: choice.baseUrl ?? "http://localhost:11434/v1",
      })(choice.model);
    case "typesafe":
    case "mock":
      throw new Error(`${choice.provider} has no language model`);
  }
}
