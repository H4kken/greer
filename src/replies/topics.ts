// Names what each reply helped with, reusing the workspace's topics so they
// stay few and stable ("Pricing", not "Pricing a SaaS" then "SaaS pricing").
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { reply, topic } from "@/db/schema";
import { generateStructured } from "@/llm/client";
import { topicOfReply } from "@/llm/prompts/topic-of-reply";

// "  first   USERS " -> "First users"; the model is asked for sentence case,
// this keeps names consistent when it slips.
export function normalizeTopic(name: string): string {
  const words = name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.:]+$/, "");
  if (!words) return "Other";
  // Brand casing (SaaS, GitHub) and short acronyms (HN, B2B, SEO) stay;
  // shouting (USERS) doesn't.
  const keepCase = (w: string) =>
    (/[a-z]/.test(w) && /[A-Z].*[A-Z]/.test(w)) ||
    (w.length <= 4 && /[A-Z]/.test(w) && w === w.toUpperCase());
  return words
    .split(" ")
    .map((w, i) =>
      keepCase(w)
        ? w
        : i === 0
          ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          : w.toLowerCase(),
    )
    .join(" ");
}

export async function nameReplyTopic(
  db: Db,
  replyId: string,
): Promise<{ status: "named"; topic: string } | { status: "skipped" }> {
  const [row] = await db.select().from(reply).where(eq(reply.id, replyId));
  if (!row || row.topicId) return { status: "skipped" };

  const existing = await db
    .select({ id: topic.id, name: topic.name })
    .from(topic)
    .where(eq(topic.workspaceId, row.workspaceId))
    .orderBy(topic.createdAt);
  const names = existing.map((t) => t.name);
  const { output } = await generateStructured(row.workspaceId, topicOfReply, {
    threadTitle: row.threadTitle,
    reply: row.text,
    topics: names,
  });
  const name = normalizeTopic(output.topic);

  // Case-insensitive unique per workspace: a topic created by a concurrent
  // job is reused rather than duplicated.
  await db
    .insert(topic)
    .values({ workspaceId: row.workspaceId, name })
    .onConflictDoNothing();
  const [saved] = await db
    .select({ id: topic.id, name: topic.name })
    .from(topic)
    .where(
      and(
        eq(topic.workspaceId, row.workspaceId),
        sql`lower(${topic.name}) = lower(${name})`,
      ),
    );
  await db
    .update(reply)
    .set({ topicId: saved!.id })
    .where(eq(reply.id, replyId));
  return { status: "named", topic: saved!.name };
}

// Replies without a topic yet, e.g. while no AI model was set.
export async function unnamedReplyIds(
  db: Db,
  { workspaceId, limit = 200 }: { workspaceId?: string; limit?: number } = {},
): Promise<string[]> {
  const rows = await db
    .select({ id: reply.id })
    .from(reply)
    .where(
      and(
        isNull(reply.topicId),
        workspaceId ? eq(reply.workspaceId, workspaceId) : undefined,
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}
