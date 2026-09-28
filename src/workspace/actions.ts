"use server";
// Server actions for onboarding and Settings. Each one checks the session,
// validates its input with zod and only touches the user's own workspace.
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { checkConnection, generateStructured } from "@/llm/client";
import { LlmNotConfiguredError, resolveLlmConfig } from "@/llm/config";
import { suggestKeywords } from "@/llm/prompts/suggest-keywords";
import { loadStoredSettings, saveLlmSettings } from "@/llm/settings";
import { requireWorkspace } from "@/lib/session";
import { startFirstScan } from "@/onboarding/scan";
import { unclassifiedAnswerIds } from "@/replies/classify";
import { unnamedReplyIds } from "@/replies/topics";
import { unscoredItemIds } from "@/scoring/score";
import { SourceHttpError } from "@/sources/http";
import { getSource } from "@/sources/registry";
import { QUEUES, repliesKey, trySendFromWeb } from "@/worker/queue";
import {
  type AccountSummary,
  markOwnPosts,
  removeAccount,
  saveAccount,
  summarizeAccount,
} from "./accounts";
import {
  addHnKeyword,
  deleteQuery,
  restoreQuery,
  type SavedQuery,
  setQueryEnabled,
} from "./keywords";
import { getProductProfile, saveProductProfile } from "./profile";
import {
  firstScanSchema,
  hnHandleSchema,
  type KeywordInput,
  keywordSchema,
  llmSettingsSchema,
  productProfileSchema,
} from "./schemas";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function invalid(error: z.ZodError): {
  ok: false;
  error: string;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    fieldErrors[key] ??= issue.message;
  }
  return {
    ok: false,
    error: error.issues[0]?.message ?? "Check the form.",
    fieldErrors,
  };
}

// ---- Product profile ----

export async function saveProductProfileAction(
  input: unknown,
  // Onboarding moves on to the next step; Settings stays on the page.
  from: "onboarding" | "settings",
): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  const parsed = productProfileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await saveProductProfile(db, workspace.id, parsed.data);
  if (from === "onboarding") redirect("/onboarding/accounts");
  revalidatePath("/settings");
  return { ok: true };
}

// ---- HN account ----

export async function linkHnAccountAction(
  handle: unknown,
): Promise<ActionResult<AccountSummary>> {
  const { workspace } = await requireWorkspace();
  const parsed = hnHandleSchema.safeParse(handle);
  if (!parsed.success) return invalid(parsed.error);

  let profile;
  try {
    profile = await getSource("hn").fetchAccount!(parsed.data);
  } catch (error) {
    console.warn("[hn] account lookup failed", error);
    return {
      ok: false,
      error:
        error instanceof SourceHttpError
          ? "Hacker News didn't answer. Try again in a minute."
          : "Couldn't reach Hacker News. Check the server's internet access and try again.",
    };
  }
  if (!profile) {
    return {
      ok: false,
      error: `No Hacker News user named "${parsed.data}". Usernames are case-sensitive.`,
    };
  }
  await saveAccount(db, workspace.id, "hn", profile);
  await markOwnPosts(db, workspace.id, "hn", profile.handle);
  // Look for their replies now rather than at the next 15-minute run.
  const key = { workspaceId: workspace.id, platform: "hn" as const };
  await trySendFromWeb([
    { name: QUEUES.repliesPoll, data: key, singletonKey: repliesKey(key) },
  ]);
  revalidatePath("/accounts");
  revalidatePath("/settings");
  revalidatePath("/onboarding/accounts");
  return {
    ok: true,
    data: summarizeAccount("hn", {
      handle: profile.handle,
      accountCreatedAt: profile.createdAt,
      karma: profile.karma,
    }),
  };
}

export async function unlinkHnAccountAction(): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  await removeAccount(db, workspace.id, "hn");
  revalidatePath("/accounts");
  revalidatePath("/settings");
  return { ok: true };
}

// ---- Keywords ----

export type KeywordSuggestion = KeywordInput & { why: string };

// Suggestions from the product profile. Without an LLM, returns none and the
// user adds keywords by hand.
export async function suggestKeywordsAction(): Promise<
  ActionResult<{ keywords: KeywordSuggestion[] }>
> {
  const { workspace } = await requireWorkspace();
  const profile = await getProductProfile(db, workspace.id);
  if (!profile) {
    return { ok: false, error: "Describe your product first (step 1)." };
  }
  try {
    const { output } = await generateStructured(workspace.id, suggestKeywords, {
      product: {
        name: profile.productName,
        description: profile.productDescription,
        audience: profile.audience,
        problems: profile.problems,
      },
    });
    const seen = new Set<string>();
    const keywords = output.keywords
      .map((k) => ({ ...k, query: k.query.trim().toLowerCase() }))
      .filter((k) => {
        const key = `${k.section}:${k.query}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { ok: true, data: { keywords } };
  } catch (error) {
    if (error instanceof LlmNotConfiguredError) {
      return {
        ok: false,
        error:
          "Add an AI key (step 1) to get suggestions, or add your own keywords below.",
      };
    }
    console.warn("[onboarding] keyword suggestions failed", error);
    return {
      ok: false,
      error:
        "Couldn't get suggestions from the AI model. Add your own keywords below, or try again.",
    };
  }
}

export async function startFirstScanAction(
  input: unknown,
): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  const parsed = firstScanSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!parsed.data.keywords.length && !parsed.data.showHn) {
    return {
      ok: false,
      error: "Add at least one keyword, or collect Show HN launches.",
    };
  }
  if (!(await getProductProfile(db, workspace.id))) {
    return { ok: false, error: "Describe your product first (step 1)." };
  }

  const queryIds = await startFirstScan(db, workspace.id, parsed.data);
  // Poll now instead of waiting for the 15-minute schedule. If the worker
  // isn't up yet, its schedule picks the queries up once it starts.
  await trySendFromWeb(
    queryIds.map((queryId) => ({
      name: QUEUES.ingestPoll,
      data: { queryId },
      singletonKey: queryId,
    })),
  );
  redirect("/onboarding/scan");
}

const queryIdSchema = z.uuid();

export async function addKeywordAction(
  input: unknown,
): Promise<ActionResult<{ query: SavedQuery }>> {
  const { workspace } = await requireWorkspace();
  const parsed = keywordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const row = await addHnKeyword(db, workspace.id, parsed.data);
  if (row === "duplicate") {
    return { ok: false, error: "That keyword is already in this section." };
  }
  await trySendFromWeb([
    {
      name: QUEUES.ingestPoll,
      data: { queryId: row.id },
      singletonKey: row.id,
    },
  ]);
  revalidatePath("/settings");
  return { ok: true, data: { query: row } };
}

export async function setKeywordEnabledAction(
  queryId: unknown,
  enabled: unknown,
): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  const id = queryIdSchema.safeParse(queryId);
  const on = z.boolean().safeParse(enabled);
  if (!id.success || !on.success) return { ok: false, error: "Invalid input." };
  if (!(await setQueryEnabled(db, workspace.id, id.data, on.data))) {
    return { ok: false, error: "That keyword no longer exists." };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteKeywordAction(
  queryId: unknown,
): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  const id = queryIdSchema.safeParse(queryId);
  if (!id.success) return { ok: false, error: "Invalid input." };
  await deleteQuery(db, workspace.id, id.data);
  revalidatePath("/settings");
  return { ok: true };
}

const restoreSchema = z.object({
  id: z.uuid(),
  section: z.enum(["ask_hn", "story_comment", "show_hn"]),
  query: z.string().max(40),
  enabled: z.boolean(),
});

export async function restoreKeywordAction(
  input: unknown,
): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await restoreQuery(db, workspace.id, parsed.data);
  revalidatePath("/settings");
  return { ok: true };
}

// ---- AI model ----

export async function saveLlmSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  const parsed = llmSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { apiKey, ...rest } = parsed.data;

  // An empty key field keeps the saved key, if it's for the same provider.
  const stored = await loadStoredSettings(workspace.id);
  const key =
    apiKey ||
    (stored?.provider === rest.provider ? stored.apiKey : null) ||
    null;
  if (rest.provider !== "ollama" && !key) {
    return {
      ok: false,
      error: "Paste an API key.",
      fieldErrors: { apiKey: "Paste an API key." },
    };
  }

  let config;
  try {
    // Only the mock setting (tests, demos) carries over from the environment.
    config = resolveLlmConfig(
      { ...rest, apiKey: key },
      {
        LLM_PROVIDER: process.env.LLM_PROVIDER === "mock" ? "mock" : undefined,
      },
    );
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  const check = await checkConnection(config);
  if (!check.ok) {
    return {
      ok: false,
      error: `The provider rejected the test call. ${check.error}`,
    };
  }

  await saveLlmSettings(workspace.id, {
    ...rest,
    // Ollama has no key: drop any key saved for another provider.
    ...(apiKey ? { apiKey } : rest.provider === "ollama" ? { apiKey: "" } : {}),
  });
  // Threads collected while no model was set wait for the 15-minute sweep;
  // score them now instead, so the first scan carries on right away.
  const waiting = await unscoredItemIds(db, {
    workspaceId: workspace.id,
    limit: 500,
  });
  const answers = await unclassifiedAnswerIds(db, {
    workspaceId: workspace.id,
  });
  const replies = await unnamedReplyIds(db, { workspaceId: workspace.id });
  await trySendFromWeb([
    ...waiting.map((itemId) => ({
      name: QUEUES.scoreItem,
      data: { itemId },
      singletonKey: itemId,
    })),
    ...answers.map((answerId) => ({
      name: QUEUES.classifyAnswer,
      data: { answerId },
      singletonKey: answerId,
    })),
    ...replies.map((replyId) => ({
      name: QUEUES.nameTopic,
      data: { replyId },
      singletonKey: replyId,
    })),
  ]);
  revalidatePath("/settings");
  revalidatePath("/onboarding/product");
  refresh();
  return { ok: true };
}
