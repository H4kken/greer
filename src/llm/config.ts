// Which model does which job. Greer uses AI for two jobs:
// - sorting: reads every new thread and decides whether the user can help.
//   High volume, so a fast, cheap model: TypeSafe's Jev is the preferred one.
// - writing: keyword suggestions, reading answers to replies, reply ideas.
//   Low volume, needs judgment: a mid-size LLM.
// Each job is resolved on its own: a choice saved in Settings wins, otherwise
// environment variables decide. A job with nothing usable is null, and the
// work waits (threads stay unscored until a sorting model is set).

export type AiJob = "sorting" | "writing";
export type AiProviderName = "typesafe" | "anthropic" | "openai" | "ollama";
export type LlmProviderName = Exclude<AiProviderName, "typesafe">;

export type ModelChoice = {
  provider: AiProviderName | "mock";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  source: "settings" | "env";
};

export type AiConfig = Record<AiJob, ModelChoice | null>;

// Only these get defaults; OpenAI-compatible and Ollama need model names.
export const DEFAULT_MODELS: Record<
  AiJob,
  Partial<Record<AiProviderName | "mock", string>>
> = {
  sorting: {
    typesafe: "jev-latest",
    anthropic: "claude-haiku-4-5",
    mock: "mock-fast",
  },
  writing: { anthropic: "claude-sonnet-5", mock: "mock-quality" },
};

export const JOB_NAMES: Record<AiJob, string> = {
  sorting: "sorting threads",
  writing: "writing help",
};

export class LlmNotConfiguredError extends Error {
  constructor(
    readonly job: AiJob,
    message = job === "sorting"
      ? "No model is set for sorting threads. Choose one in Settings → AI (TypeSafe Jev is the cheapest), or set TYPESAFE_API_KEY or ANTHROPIC_API_KEY on the server."
      : "No model is set for writing help (keyword suggestions, reading answers). Choose Claude, OpenAI or Ollama in Settings → AI, or set ANTHROPIC_API_KEY on the server.",
  ) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

export type StoredKey = { apiKey: string | null; baseUrl: string | null };

export type StoredAiSettings = {
  sorting: { provider: AiProviderName; model: string | null } | null;
  writing: { provider: LlmProviderName; model: string | null } | null;
  keys: Partial<Record<AiProviderName, StoredKey>>; // already decrypted
};

type Env = Record<string, string | undefined>;

const LLM_PROVIDERS: LlmProviderName[] = ["anthropic", "openai", "ollama"];

// A saved key wins over the environment's, provider by provider. Ollama's
// "credential" is its server URL. In mock mode (tests, demos) the environment's
// TypeSafe key is ignored, so a developer's real key never leaks into tests.
function credentials(
  provider: AiProviderName,
  stored: StoredAiSettings | null,
  env: Env,
): { apiKey?: string; baseUrl?: string } | null {
  const saved = stored?.keys[provider];
  switch (provider) {
    case "typesafe": {
      const apiKey =
        saved?.apiKey ||
        (env.LLM_PROVIDER === "mock" ? undefined : env.TYPESAFE_API_KEY);
      return apiKey ? { apiKey } : null;
    }
    case "anthropic": {
      const apiKey = saved?.apiKey || env.ANTHROPIC_API_KEY;
      return apiKey ? { apiKey } : null;
    }
    case "openai": {
      const apiKey = saved?.apiKey || env.OPENAI_API_KEY;
      const baseUrl = saved?.baseUrl || env.OPENAI_BASE_URL || undefined;
      return apiKey ? { apiKey, baseUrl } : null;
    }
    case "ollama": {
      const baseUrl = saved?.baseUrl || env.OLLAMA_BASE_URL;
      return baseUrl ? { baseUrl } : null;
    }
  }
}

function choose(
  job: AiJob,
  provider: AiProviderName,
  model: string | null | undefined,
  source: ModelChoice["source"],
  stored: StoredAiSettings | null,
  env: Env,
): ModelChoice | null {
  const creds = credentials(provider, stored, env);
  const name = model || DEFAULT_MODELS[job][provider];
  if (!creds || !name) return null;
  return { provider, model: name, ...creds, source };
}

// The LLM provider the environment points at: LLM_PROVIDER, or the first one
// with credentials.
function envLlmProvider(
  stored: StoredAiSettings | null,
  env: Env,
): LlmProviderName | null {
  const explicit = env.LLM_PROVIDER as LlmProviderName | undefined;
  if (explicit && LLM_PROVIDERS.includes(explicit)) return explicit;
  return LLM_PROVIDERS.find((p) => credentials(p, stored, env)) ?? null;
}

// Pure, so every combination is unit-tested.
export function resolveAiConfig(
  stored: StoredAiSettings | null,
  rawEnv: Env,
): AiConfig {
  // Empty means unset (docker compose passes unset variables as "").
  const env: Env = Object.fromEntries(
    Object.entries(rawEnv).filter(([, v]) => v !== ""),
  );

  if (env.LLM_PROVIDER === "mock") {
    const mock = (job: AiJob): ModelChoice => ({
      provider: "mock",
      model: DEFAULT_MODELS[job].mock!,
      source: "env",
    });
    // A TypeSafe key saved in Settings is still used, so tests can exercise
    // Jev (with a stubbed network) and its fallback.
    const jev =
      stored?.sorting?.provider === "typesafe"
        ? choose("sorting", "typesafe", null, "settings", stored, env)
        : null;
    return { sorting: jev ?? mock("sorting"), writing: mock("writing") };
  }

  const writing = stored?.writing
    ? choose(
        "writing",
        stored.writing.provider,
        stored.writing.model,
        "settings",
        stored,
        env,
      )
    : // Not chosen in Settings: the server's environment alone decides
      // (saved keys only serve saved choices, so "Clear choice" clears).
      (() => {
        const provider = envLlmProvider(null, env);
        return provider
          ? choose("writing", provider, env.LLM_WRITING_MODEL, "env", null, env)
          : null;
      })();

  const sorting = stored?.sorting
    ? choose(
        "sorting",
        stored.sorting.provider,
        stored.sorting.model,
        "settings",
        stored,
        env,
      )
    : credentials("typesafe", null, env)
      ? choose("sorting", "typesafe", null, "env", null, env)
      : (() => {
          const provider = envLlmProvider(null, env);
          return provider
            ? choose(
                "sorting",
                provider,
                env.LLM_SORTING_MODEL,
                "env",
                null,
                env,
              )
            : null;
        })();

  return { sorting, writing };
}

// Sorts a thread when Jev fails: the writing provider, with its own cheap
// sorting model when it has one (Claude Haiku), else the writing model.
export function sortingFallback(config: AiConfig): ModelChoice | null {
  const w = config.writing;
  if (!w || config.sorting?.provider !== "typesafe") return null;
  return { ...w, model: DEFAULT_MODELS.sorting[w.provider] ?? w.model };
}

// The LLM that sorts threads: the sorting model, or the fallback when Jev
// sorts. Evals compare it with Jev.
export function llmSortingChoice(config: AiConfig): ModelChoice | null {
  return config.sorting?.provider === "typesafe"
    ? sortingFallback(config)
    : config.sorting;
}

// For scripts: the environment's model for a job, or a clear error.
export function envChoice(
  job: AiJob,
  env: Env,
  pick: (c: AiConfig) => ModelChoice | null = (c) => c[job],
): ModelChoice {
  const choice = pick(resolveAiConfig(null, env));
  if (!choice) throw new LlmNotConfiguredError(job);
  return choice;
}
