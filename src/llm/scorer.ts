// Which model scores threads. TypeSafe's Jev is preferred: about 30× cheaper
// and 6× faster than an LLM for the same criteria (`pnpm eval jev`). The LLM
// provider (Settings or env) is the fallback, and does everything Jev can't:
// keyword suggestions, answer tones, topics, reply ideas.
import { type LlmConfig, LlmNotConfiguredError } from "./config";

export type Scorer =
  | {
      kind: "jev";
      apiKey: string;
      source: "settings" | "env";
      // Scores a thread when a Jev call fails; null when no LLM is set.
      fallback: LlmConfig | null;
    }
  | { kind: "llm"; config: LlmConfig };

// Nothing to score with: threads wait, and the 15-minute sweep scores them
// once a key is added. A subclass, so every `LlmNotConfiguredError` handler
// (worker, actions) treats it the same way.
export class ScorerNotConfiguredError extends LlmNotConfiguredError {
  constructor(
    message = "No AI model is configured for scoring. Add a TypeSafe key (recommended) or an AI provider in Settings, or set TYPESAFE_API_KEY on the server.",
  ) {
    super();
    this.message = message;
    this.name = "ScorerNotConfiguredError";
  }
}

type Env = Record<string, string | undefined>;

// Pure: a key saved in Settings wins over TYPESAFE_API_KEY. Mock mode (tests,
// demos) ignores the environment's key, so a developer's real key never
// leaks into test runs; a key saved in Settings is still used.
export function resolveScorer(
  storedJevKey: string | null,
  env: Env,
  llm: LlmConfig | null,
): Scorer {
  const envKey = env.LLM_PROVIDER === "mock" ? null : env.TYPESAFE_API_KEY;
  const apiKey = storedJevKey || envKey || null;
  if (apiKey) {
    return {
      kind: "jev",
      apiKey,
      source: storedJevKey ? "settings" : "env",
      fallback: llm,
    };
  }
  if (llm) return { kind: "llm", config: llm };
  throw new ScorerNotConfiguredError();
}
