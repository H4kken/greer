import { describe, expect, it } from "vitest";
import { LlmNotConfiguredError, resolveLlmConfig } from "@/llm/config";

describe("resolveLlmConfig", () => {
  it("fails clearly when nothing is configured", () => {
    expect(() => resolveLlmConfig(null, {})).toThrow(LlmNotConfiguredError);
  });

  it("picks Anthropic from its env key, with default models", () => {
    expect(resolveLlmConfig(null, { ANTHROPIC_API_KEY: "sk-ant" })).toEqual({
      provider: "anthropic",
      models: { fast: "claude-haiku-4-5", quality: "claude-opus-5" },
      apiKey: "sk-ant",
      baseUrl: undefined,
      source: "env",
    });
  });

  it("lets settings saved in the database win over env", () => {
    const config = resolveLlmConfig(
      {
        provider: "anthropic",
        apiKey: "from-settings",
        fastModel: null,
        qualityModel: "claude-sonnet-5",
        baseUrl: null,
      },
      { ANTHROPIC_API_KEY: "from-env" },
    );
    expect(config).toMatchObject({
      source: "settings",
      apiKey: "from-settings",
      models: { fast: "claude-haiku-4-5", quality: "claude-sonnet-5" },
    });
  });

  it("requires model names for providers without defaults", () => {
    expect(() => resolveLlmConfig(null, { OPENAI_API_KEY: "sk" })).toThrow(
      /fast and a quality model/,
    );
    expect(
      resolveLlmConfig(null, {
        OPENAI_API_KEY: "sk",
        LLM_FAST_MODEL: "small",
        LLM_QUALITY_MODEL: "large",
      }).models,
    ).toEqual({ fast: "small", quality: "large" });
  });

  it("supports Ollama without a key", () => {
    expect(
      resolveLlmConfig(null, {
        OLLAMA_BASE_URL: "http://ollama:11434/v1",
        LLM_FAST_MODEL: "llama",
        LLM_QUALITY_MODEL: "llama",
      }),
    ).toMatchObject({ provider: "ollama", baseUrl: "http://ollama:11434/v1" });
  });

  it("uses the mock provider when LLM_PROVIDER=mock, even with keys set", () => {
    expect(
      resolveLlmConfig(null, { LLM_PROVIDER: "mock", ANTHROPIC_API_KEY: "sk" })
        .provider,
    ).toBe("mock");
  });
});
