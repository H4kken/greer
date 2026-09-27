import { eq } from "drizzle-orm";
import { db } from "@/db";
import { llmSettings } from "@/db/schema";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import {
  type LlmConfig,
  resolveLlmConfig,
  type StoredSettings,
} from "./config";

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

// Whether scoring can run, and with what: for Settings and onboarding.
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
