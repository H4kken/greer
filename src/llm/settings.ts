import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiKey, aiSettings } from "@/db/schema";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import {
  type AiConfig,
  type AiJob,
  type AiProviderName,
  type LlmProviderName,
  type ModelChoice,
  resolveAiConfig,
  sortingFallback,
  type StoredAiSettings,
} from "./config";

export async function loadStoredAiSettings(
  workspaceId: string,
): Promise<StoredAiSettings | null> {
  const [[row], keys] = await Promise.all([
    db.select().from(aiSettings).where(eq(aiSettings.workspaceId, workspaceId)),
    db.select().from(aiKey).where(eq(aiKey.workspaceId, workspaceId)),
  ]);
  if (!row && keys.length === 0) return null;
  return {
    sorting: row?.sortingProvider
      ? { provider: row.sortingProvider, model: row.sortingModel }
      : null,
    writing:
      row?.writingProvider && row.writingProvider !== "typesafe"
        ? { provider: row.writingProvider, model: row.writingModel }
        : null,
    keys: Object.fromEntries(
      keys.map((k) => [
        k.provider,
        {
          apiKey: k.apiKeyEncrypted ? decryptSecret(k.apiKeyEncrypted) : null,
          baseUrl: k.baseUrl,
        },
      ]),
    ),
  };
}

export async function getAiConfig(workspaceId: string): Promise<AiConfig> {
  return resolveAiConfig(await loadStoredAiSettings(workspaceId), process.env);
}

export type SaveAiJobInput = {
  provider: AiProviderName;
  model: string | null;
  apiKey?: string; // omitted = keep the saved key
  baseUrl?: string | null; // omitted = keep the saved URL
};

// Picks a job's provider and model, and stores the provider's key (shared by
// both jobs) when a new one is given.
export async function saveAiJob(
  workspaceId: string,
  job: AiJob,
  input: SaveAiJobInput,
): Promise<void> {
  if (input.apiKey !== undefined || input.baseUrl !== undefined) {
    const values = {
      ...(input.apiKey !== undefined && {
        apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
      }),
      ...(input.baseUrl !== undefined && { baseUrl: input.baseUrl }),
    };
    await db
      .insert(aiKey)
      .values({ workspaceId, provider: input.provider, ...values })
      .onConflictDoUpdate({
        target: [aiKey.workspaceId, aiKey.provider],
        set: values,
      });
  }
  const values =
    job === "sorting"
      ? { sortingProvider: input.provider, sortingModel: input.model }
      : { writingProvider: input.provider, writingModel: input.model };
  await db
    .insert(aiSettings)
    .values({ workspaceId, ...values })
    .onConflictDoUpdate({ target: aiSettings.workspaceId, set: values });
}

// Back to the environment's choice for this job (or nothing). Saved keys stay,
// so switching back doesn't mean pasting them again.
export async function clearAiJob(
  workspaceId: string,
  job: AiJob,
): Promise<void> {
  await db
    .update(aiSettings)
    .set(
      job === "sorting"
        ? { sortingProvider: null, sortingModel: null }
        : { writingProvider: null, writingModel: null },
    )
    .where(eq(aiSettings.workspaceId, workspaceId));
}

export async function forgetAiKey(
  workspaceId: string,
  provider: AiProviderName,
): Promise<void> {
  await db
    .delete(aiKey)
    .where(
      and(eq(aiKey.workspaceId, workspaceId), eq(aiKey.provider, provider)),
    );
}

export type SavedKeys = Partial<
  Record<AiProviderName, { apiKey: string | null; baseUrl: string | null }>
>;

// What the Settings forms may show: never a key itself, only a masked one.
export async function describeAiSettings(workspaceId: string): Promise<{
  sorting: { provider: AiProviderName; model: string | null } | null;
  writing: { provider: LlmProviderName; model: string | null } | null;
  keys: SavedKeys;
}> {
  const stored = await loadStoredAiSettings(workspaceId);
  return {
    sorting: stored?.sorting ?? null,
    writing: stored?.writing ?? null,
    keys: Object.fromEntries(
      Object.entries(stored?.keys ?? {}).map(([p, k]) => [
        p,
        { apiKey: k.apiKey ? maskSecret(k.apiKey) : null, baseUrl: k.baseUrl },
      ]),
    ),
  };
}

// Which providers the server's environment has credentials for, so a form
// can say "uses the server's key" instead of asking for one.
export function serverKeys(): Record<AiProviderName, boolean> {
  const env = process.env;
  return {
    typesafe: !!env.TYPESAFE_API_KEY && env.LLM_PROVIDER !== "mock",
    anthropic: !!env.ANTHROPIC_API_KEY,
    openai: !!env.OPENAI_API_KEY,
    ollama: !!env.OLLAMA_BASE_URL,
  };
}

export type JobStatus =
  | ({ configured: true } & Pick<ModelChoice, "provider" | "model" | "source">)
  | { configured: false };

export type AiStatus = {
  sorting: JobStatus;
  writing: JobStatus;
  // Sorts threads when Jev fails.
  fallback: Pick<ModelChoice, "provider" | "model"> | null;
};

const status = (c: ModelChoice | null): JobStatus =>
  c
    ? {
        configured: true,
        provider: c.provider,
        model: c.model,
        source: c.source,
      }
    : { configured: false };

// What each job runs on: Settings, onboarding, Today.
export async function getAiStatus(workspaceId: string): Promise<AiStatus> {
  const config = await getAiConfig(workspaceId);
  const fallback = sortingFallback(config);
  return {
    sorting: status(config.sorting),
    writing: status(config.writing),
    fallback: fallback
      ? { provider: fallback.provider, model: fallback.model }
      : null,
  };
}

// Everything the AI settings cards need, in one call.
export async function getAiSettingsView(workspaceId: string) {
  const [status, described] = await Promise.all([
    getAiStatus(workspaceId),
    describeAiSettings(workspaceId),
  ]);
  return {
    status,
    saved: { sorting: described.sorting, writing: described.writing },
    keys: described.keys,
    serverKeys: serverKeys(),
  };
}
