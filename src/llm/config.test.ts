import { describe, expect, it } from "vitest";
import {
  envChoice,
  LlmNotConfiguredError,
  llmSortingChoice,
  resolveAiConfig,
  sortingFallback,
  type StoredAiSettings,
} from "@/llm/config";

const none = { sorting: null, writing: null, keys: {} };
const stored = (s: Partial<StoredAiSettings>): StoredAiSettings => ({
  ...none,
  ...s,
});

describe("resolveAiConfig", () => {
  it("leaves both jobs unset when nothing is configured", () => {
    expect(resolveAiConfig(null, {})).toEqual({ sorting: null, writing: null });
  });

  it("uses one Anthropic key from the env for both jobs, with defaults", () => {
    expect(resolveAiConfig(null, { ANTHROPIC_API_KEY: "sk-ant" })).toEqual({
      sorting: {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        apiKey: "sk-ant",
        source: "env",
      },
      writing: {
        provider: "anthropic",
        model: "claude-sonnet-5",
        apiKey: "sk-ant",
        source: "env",
      },
    });
  });

  it("prefers TypeSafe for sorting when its key is set", () => {
    const config = resolveAiConfig(null, {
      TYPESAFE_API_KEY: "ts",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    expect(config.sorting).toMatchObject({
      provider: "typesafe",
      model: "jev-latest",
      apiKey: "ts",
    });
    expect(config.writing?.provider).toBe("anthropic");
  });

  it("sorts with TypeSafe alone; writing help stays unset", () => {
    expect(resolveAiConfig(null, { TYPESAFE_API_KEY: "ts" })).toMatchObject({
      sorting: { provider: "typesafe" },
      writing: null,
    });
  });

  // docker compose passes unset optional variables as empty strings.
  it("treats empty variables as unset, like docker compose sends them", () => {
    const config = resolveAiConfig(null, {
      ANTHROPIC_API_KEY: "sk-ant",
      TYPESAFE_API_KEY: "",
      LLM_PROVIDER: "",
      LLM_SORTING_MODEL: "",
      OPENAI_BASE_URL: "",
    });
    expect(config.sorting).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
  });

  it("needs model names for OpenAI and Ollama, per job", () => {
    const env = { OPENAI_API_KEY: "sk", LLM_WRITING_MODEL: "large" };
    expect(resolveAiConfig(null, env)).toMatchObject({
      sorting: null,
      writing: { provider: "openai", model: "large" },
    });
    expect(
      resolveAiConfig(null, {
        OLLAMA_BASE_URL: "http://ollama:11434/v1",
        LLM_SORTING_MODEL: "llama-small",
        LLM_WRITING_MODEL: "llama-big",
      }),
    ).toMatchObject({
      sorting: { provider: "ollama", baseUrl: "http://ollama:11434/v1" },
      writing: { model: "llama-big" },
    });
  });

  it("lets a job saved in Settings win over the env, job by job", () => {
    const config = resolveAiConfig(
      stored({
        writing: { provider: "openai", model: "gpt-mid" },
        keys: { openai: { apiKey: "sk-saved", baseUrl: null } },
      }),
      { TYPESAFE_API_KEY: "ts", ANTHROPIC_API_KEY: "sk-ant" },
    );
    expect(config.writing).toEqual({
      provider: "openai",
      model: "gpt-mid",
      apiKey: "sk-saved",
      baseUrl: undefined,
      source: "settings",
    });
    // Sorting isn't saved: the environment still decides.
    expect(config.sorting).toMatchObject({
      provider: "typesafe",
      source: "env",
    });
  });

  it("uses the server's key for a saved choice without its own key", () => {
    const config = resolveAiConfig(
      stored({ sorting: { provider: "anthropic", model: null } }),
      { ANTHROPIC_API_KEY: "sk-env" },
    );
    expect(config.sorting).toMatchObject({
      apiKey: "sk-env",
      model: "claude-haiku-4-5",
      source: "settings",
    });
  });

  it("ignores saved keys for jobs not chosen in Settings", () => {
    // A cleared choice doesn't come back through a key that's still saved.
    const config = resolveAiConfig(
      stored({ keys: { typesafe: { apiKey: "ts-saved", baseUrl: null } } }),
      {},
    );
    expect(config.sorting).toBeNull();
  });

  it("leaves a saved job unset when its key is gone", () => {
    expect(
      resolveAiConfig(
        stored({ sorting: { provider: "typesafe", model: null } }),
        {},
      ).sorting,
    ).toBeNull();
  });

  it("answers with the mock in mock mode, even with keys set", () => {
    const config = resolveAiConfig(null, {
      LLM_PROVIDER: "mock",
      ANTHROPIC_API_KEY: "sk",
      TYPESAFE_API_KEY: "ts",
    });
    expect(config.sorting?.provider).toBe("mock");
    expect(config.writing?.provider).toBe("mock");
  });

  it("still uses a TypeSafe key saved in Settings in mock mode", () => {
    const config = resolveAiConfig(
      stored({
        sorting: { provider: "typesafe", model: null },
        keys: { typesafe: { apiKey: "ts-saved", baseUrl: null } },
      }),
      { LLM_PROVIDER: "mock" },
    );
    expect(config.sorting).toMatchObject({
      provider: "typesafe",
      apiKey: "ts-saved",
    });
    expect(config.writing?.provider).toBe("mock");
  });
});

describe("sortingFallback", () => {
  it("sorts with the writing provider's cheap model when Jev fails", () => {
    const config = resolveAiConfig(null, {
      TYPESAFE_API_KEY: "ts",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    expect(sortingFallback(config)).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
    expect(llmSortingChoice(config)?.model).toBe("claude-haiku-4-5");
  });

  it("uses the writing model when the provider has no cheap default", () => {
    const config = resolveAiConfig(null, {
      TYPESAFE_API_KEY: "ts",
      OPENAI_API_KEY: "sk",
      LLM_WRITING_MODEL: "gpt-mid",
    });
    expect(sortingFallback(config)?.model).toBe("gpt-mid");
  });

  it("is null without Jev or without a writing model", () => {
    expect(
      sortingFallback(resolveAiConfig(null, { ANTHROPIC_API_KEY: "sk" })),
    ).toBeNull();
    expect(
      sortingFallback(resolveAiConfig(null, { TYPESAFE_API_KEY: "ts" })),
    ).toBeNull();
  });
});

describe("envChoice", () => {
  it("fails with a job-specific error when the job has no model", () => {
    expect(() => envChoice("writing", { TYPESAFE_API_KEY: "ts" })).toThrow(
      LlmNotConfiguredError,
    );
    expect(() => envChoice("writing", {})).toThrow(/writing help/);
  });
});
