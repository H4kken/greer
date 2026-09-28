import { describe, expect, it } from "vitest";
import type { LlmConfig } from "./config";
import { resolveScorer, ScorerNotConfiguredError } from "./scorer";

const llm: LlmConfig = {
  provider: "anthropic",
  models: { fast: "claude-haiku-4-5", quality: "claude-opus-5" },
  apiKey: "sk-ant",
  source: "env",
};

describe("resolveScorer", () => {
  it("prefers Jev, with the LLM as fallback", () => {
    expect(resolveScorer("ts-saved", {}, llm)).toEqual({
      kind: "jev",
      apiKey: "ts-saved",
      source: "settings",
      fallback: llm,
    });
  });

  it("uses TYPESAFE_API_KEY when nothing is saved; a saved key wins", () => {
    const env = { TYPESAFE_API_KEY: "ts-env" };
    expect(resolveScorer(null, env, null)).toMatchObject({
      kind: "jev",
      apiKey: "ts-env",
      source: "env",
      fallback: null,
    });
    expect(resolveScorer("ts-saved", env, null)).toMatchObject({
      apiKey: "ts-saved",
    });
  });

  it("falls back to the LLM without a TypeSafe key", () => {
    expect(resolveScorer(null, { TYPESAFE_API_KEY: "" }, llm)).toEqual({
      kind: "llm",
      config: llm,
    });
  });

  it("ignores the environment's key in mock mode, not a saved one", () => {
    const env = { LLM_PROVIDER: "mock", TYPESAFE_API_KEY: "ts-env" };
    expect(resolveScorer(null, env, llm).kind).toBe("llm");
    expect(resolveScorer("ts-saved", env, llm).kind).toBe("jev");
  });

  it("fails with a clear error when nothing is set", () => {
    expect(() => resolveScorer(null, {}, null)).toThrow(
      ScorerNotConfiguredError,
    );
    expect(() => resolveScorer(null, {}, null)).toThrow(/TypeSafe/);
  });
});
