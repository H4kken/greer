"use server";
// Triage actions. Today updates optimistically and calls these; each one
// checks the session and only touches items in the user's workspace.
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { seenNews, sourceQuery } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { QUEUES, repliesKey, trySendFromWeb } from "@/worker/queue";
import { dismissItem, markReplied, restoreItem } from "./triage";

type Result = { ok: true } | { ok: false; error: string };

const itemId = z.uuid();
const NOT_FOUND: Result = {
  ok: false,
  error: "This thread no longer exists. Reload the page.",
};

export async function dismissAction(
  id: unknown,
  reason?: unknown,
): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const parsed = itemId.safeParse(id);
  const why = z.string().trim().max(500).optional().safeParse(reason);
  if (!parsed.success || !why.success)
    return { ok: false, error: "Invalid input." };
  return (await dismissItem(db, workspace.id, parsed.data, why.data || null))
    ? { ok: true }
    : NOT_FOUND;
}

export async function repliedAction(id: unknown): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const parsed = itemId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await markReplied(db, workspace.id, parsed.data))) return NOT_FOUND;
  // Look for the reply now rather than at the next 15-minute check. If the
  // worker isn't reachable, the next check still finds it.
  await checkRepliesNow(workspace.id);
  return { ok: true };
}

function checkRepliesNow(workspaceId: string) {
  const key = { workspaceId, platform: "hn" as const };
  return trySendFromWeb([
    { name: QUEUES.repliesPoll, data: key, singletonKey: repliesKey(key) },
  ]);
}

// "It's there, look again": one more reply check, right now.
export async function lookAgainAction(): Promise<Result> {
  const { workspace } = await requireWorkspace();
  return (await checkRepliesNow(workspace.id))
    ? { ok: true }
    : {
        ok: false,
        error: "The background worker isn't reachable. Is it running?",
      };
}

export async function restoreAction(id: unknown): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const parsed = itemId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  return (await restoreItem(db, workspace.id, parsed.data))
    ? { ok: true }
    : NOT_FOUND;
}

// "Retry now" on the partial-failure banner: queue the failing searches.
export async function retryFailedSearchesAction(): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const failing = await db
    .select({ id: sourceQuery.id })
    .from(sourceQuery)
    .where(
      and(
        eq(sourceQuery.workspaceId, workspace.id),
        eq(sourceQuery.enabled, true),
        isNotNull(sourceQuery.lastError),
      ),
    );
  const sent = await trySendFromWeb(
    failing.map((q) => ({
      name: QUEUES.ingestPoll,
      data: { queryId: q.id },
      singletonKey: q.id,
    })),
  );
  return sent
    ? { ok: true }
    : {
        ok: false,
        error: "The background worker isn't reachable. Is it running?",
      };
}

// News from someone the user knows, read on Today: it won't show as news
// again. Quiet by design: no toast, nothing to undo (it only leaves Today on
// the next visit, and People keeps everything).
export async function markSeenAction(subjects: unknown): Promise<Result> {
  const { workspace } = await requireWorkspace();
  const parsed = z
    .array(z.string().regex(/^(answer|item):[\w-]{1,64}$/))
    .min(1)
    .max(4)
    .safeParse(subjects);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const seenAt = new Date();
  await db
    .insert(seenNews)
    .values(
      parsed.data.map((subject) => ({
        workspaceId: workspace.id,
        platform: "hn" as const,
        subject,
        seenAt,
      })),
    )
    .onConflictDoNothing();
  return { ok: true };
}
