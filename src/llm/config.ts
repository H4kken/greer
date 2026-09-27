import type { ModelSlot } from "./prompt";

export type LlmProviderName = "anthropic" | "openai" | "ollama" | "mock";

export type LlmConfig = {
  provider: LlmProviderName;
  models: Record<ModelSlot, string>;
  apiKey?: string;
  baseUrl?: string;
  source: "settings" | "env";
};

// Only Anthropic gets built-in defaults; other providers name their models.
export const DEFAULT_MODELS: Partial<
  Record<LlmProviderName, Record<ModelSlot, string>>
> = {
  anthropic: { fast: "claude-haiku-4-5", quality: "claude-opus-5" },
  mock: { fast: "mock-fast", quality: "mock-quality" },
};

export class LlmNotConfiguredError extends Error {
  constructor(message = "No LLM provider is configured.") {
    super(
      `${message} Add an API key in Settings, or set ANTHROPIC_API_KEY (or OPENAI_API_KEY / OLLAMA_BASE_URL) on the server.`,
    );
    this.name = "LlmNotConfiguredError";
  }
}

export type StoredSettings = {
  provider: Exclude<LlmProviderName, "mock">;
  fastModel: string | null;
  qualityModel: string | null;
  baseUrl: string | null;
  apiKey: string | null; // already decrypted
};

type Env = Record<string, string | undefined>;

function models(
  provider: LlmProviderName,
  fast: string | null | undefined,
  quality: string | null | undefined,
): Record<ModelSlot, string> {
  const defaults = DEFAULT_MODELS[provider];
  const resolved = {
    fast: fast || defaults?.fast,
    quality: quality || defaults?.quality,
  };
  if (!resolved.fast || !resolved.quality) {
    throw new LlmNotConfiguredError(
      `The ${provider} provider needs both a fast and a quality model name (LLM_FAST_MODEL / LLM_QUALITY_MODEL, or in Settings).`,
    );
  }
  return resolved as Record<ModelSlot, string>;
}

// Pure: settings saved in the database win over environment variables.
export function resolveLlmConfig(
  stored: StoredSettings | null,
  rawEnv: Env,
): LlmConfig {
  // Empty means unset (docker compose passes unset variables as "").
  const env: Env = Object.fromEntries(
    Object.entries(rawEnv).filter(([, v]) => v !== ""),
  );
  if (env.LLM_PROVIDER === "mock") {
    return {
      provider: "mock",
      models: models("mock", null, null),
      source: "env",
    };
  }

  if (stored) {
    if (stored.provider !== "ollama" && !stored.apiKey) {
      throw new LlmNotConfiguredError(
        `The saved ${stored.provider} settings have no API key.`,
      );
    }
    return {
      provider: stored.provider,
      models: models(stored.provider, stored.fastModel, stored.qualityModel),
      apiKey: stored.apiKey ?? undefined,
      baseUrl: stored.baseUrl ?? undefined,
      source: "settings",
    };
  }

  const explicit = env.LLM_PROVIDER as LlmProviderName | undefined;
  const provider: LlmProviderName | undefined =
    explicit ??
    (env.ANTHROPIC_API_KEY
      ? "anthropic"
      : env.OPENAI_API_KEY
        ? "openai"
        : env.OLLAMA_BASE_URL
          ? "ollama"
          : undefined);
  if (!provider) throw new LlmNotConfiguredError();

  const apiKey =
    provider === "anthropic"
      ? env.ANTHROPIC_API_KEY
      : provider === "openai"
        ? env.OPENAI_API_KEY
        : undefined;
  if ((provider === "anthropic" || provider === "openai") && !apiKey) {
    throw new LlmNotConfiguredError(
      `LLM_PROVIDER is ${provider} but its API key is not set.`,
    );
  }

  return {
    provider,
    models: models(provider, env.LLM_FAST_MODEL, env.LLM_QUALITY_MODEL),
    apiKey,
    baseUrl: provider === "ollama" ? env.OLLAMA_BASE_URL : env.OPENAI_BASE_URL,
    source: "env",
  };
}
