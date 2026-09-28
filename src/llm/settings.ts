import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jevSettings, llmSettings } from "@/db/schema";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import {
  type LlmConfig,
  LlmNotConfiguredError,
  resolveLlmConfig,
  type StoredSettings,
} from "./config";
import { resolveScorer, type Scorer } from "./scorer";

export async function loadStoredSettings(
  workspaceId: string,
): Promise<StoredSettings | null> {
  const [row] = await db
    .select()
    .from(llmSettings)
    .where(eq(llmSettings.workspaceId, workspaceId));
  if (!row) return null;
  return {
    provider: row.provider,
    fastModel: row.fastModel,
    qualityModel: row.qualityModel,
    baseUrl: row.baseUrl,
    apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : null,
  };
}

export async function getLlmConfig(workspaceId: string): Promise<LlmConfig> {
  return resolveLlmConfig(await loadStoredSettings(workspaceId), process.env);
}

export type SaveLlmSettingsInput = {
  provider: StoredSettings["provider"];
  apiKey?: string; // omitted = keep the current key
  fastModel?: string | null;
  qualityModel?: string | null;
  baseUrl?: string | null;
};

export async function saveLlmSettings(
  workspaceId: string,
  input: SaveLlmSettingsInput,
): Promise<void> {
  const values = {
    provider: input.provider,
    fastModel: input.fastModel ?? null,
    qualityModel: input.qualityModel ?? null,
    baseUrl: input.baseUrl ?? null,
    ...(input.apiKey !== undefined && {
      apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
    }),
  };
  await db
    .insert(llmSettings)
    .values({ workspaceId, ...values })
    .onConflictDoUpdate({ target: llmSettings.workspaceId, set: values });
}

export async function clearLlmSettings(workspaceId: string): Promise<void> {
  await db.delete(llmSettings).where(eq(llmSettings.workspaceId, workspaceId));
}

// What the Settings page may show: never the key itself.
export async function describeLlmSettings(workspaceId: string) {
  const stored = await loadStoredSettings(workspaceId);
  return stored
    ? { ...stored, apiKey: stored.apiKey ? maskSecret(stored.apiKey) : null }
    : null;
}

export type LlmStatus =
  | {
      configured: true;
      source: LlmConfig["source"];
      provider: LlmConfig["provider"];
      models: LlmConfig["models"];
    }
  | { configured: false; problem: string };

// Whether the LLM provider is set, and with what (scoring may still run
// without it, with Jev: see getScoringStatus).
export async function getLlmStatus(workspaceId: string): Promise<LlmStatus> {
  try {
    const config = await getLlmConfig(workspaceId);
    return {
      configured: true,
      source: config.source,
      provider: config.provider,
      models: config.models,
    };
  } catch (error) {
    return {
      configured: false,
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---- TypeSafe (Jev), the preferred scorer ----

export async function loadJevKey(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ key: jevSettings.apiKeyEncrypted })
    .from(jevSettings)
    .where(eq(jevSettings.workspaceId, workspaceId));
  return row ? decryptSecret(row.key) : null;
}

export async function saveJevKey(
  workspaceId: string,
  apiKey: string,
): Promise<void> {
  const apiKeyEncrypted = encryptSecret(apiKey);
  await db
    .insert(jevSettings)
    .values({ workspaceId, apiKeyEncrypted })
    .onConflictDoUpdate({
      target: jevSettings.workspaceId,
      set: { apiKeyEncrypted },
    });
}

export async function clearJevKey(workspaceId: string): Promise<void> {
  await db.delete(jevSettings).where(eq(jevSettings.workspaceId, workspaceId));
}

// The saved key, masked, for the Settings form.
export async function describeJevKey(
  workspaceId: string,
): Promise<string | null> {
  const key = await loadJevKey(workspaceId);
  return key ? maskSecret(key) : null;
}

async function llmConfigOrNull(workspaceId: string): Promise<LlmConfig | null> {
  try {
    return await getLlmConfig(workspaceId);
  } catch (error) {
    if (error instanceof LlmNotConfiguredError) return null;
    throw error;
  }
}

export async function getScorer(workspaceId: string): Promise<Scorer> {
  const [jevKey, llm] = await Promise.all([
    loadJevKey(workspaceId),
    llmConfigOrNull(workspaceId),
  ]);
  return resolveScorer(jevKey, process.env, llm);
}

export type ScoringStatus =
  | {
      configured: true;
      kind: "jev";
      source: "settings" | "env";
      fallback: LlmConfig["provider"] | null;
    }
  | {
      configured: true;
      kind: "llm";
      source: LlmConfig["source"];
      provider: LlmConfig["provider"];
      model: string;
    }
  | { configured: false };

// Whether threads can be scored, and with what: Settings, onboarding, Today.
export async function getScoringStatus(
  workspaceId: string,
): Promise<ScoringStatus> {
  try {
    const scorer = await getScorer(workspaceId);
    return scorer.kind === "jev"
      ? {
          configured: true,
          kind: "jev",
          source: scorer.source,
          fallback: scorer.fallback?.provider ?? null,
        }
      : {
          configured: true,
          kind: "llm",
          source: scorer.config.source,
          provider: scorer.config.provider,
          model: scorer.config.models.fast,
        };
  } catch (error) {
    if (error instanceof LlmNotConfiguredError) return { configured: false };
    throw error;
  }
}
