// What the inbox shows. Only scored, kept items appear; low scores are hidden
// by default so the daily triage stays short.
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  max,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "@/db";
import { item, itemScore, sourceQuery } from "@/db/schema";

// Below this, a thread is a "lower match": hidden unless asked for.
export const MIN_SCORE = 50;

export const INBOX_VIEWS = [
  "help",
  "feedback",
  "snoozed",
  "dismissed",
] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];
export type InboxSort = "best" | "newest";

export type InboxOptions = {
  view: InboxView;
  sort: InboxSort;
  queryId?: string;
  showLow: boolean;
  limit: number;
  now?: Date;
};

// New, or snoozed until a time that has passed.
const active = (now: Date) =>
  sql`(${item.triageStatus} = 'new' or (${item.triageStatus} = 'snoozed' and ${item.snoozedUntil} <= ${now}))`;

function viewFilter(view: InboxView, now: Date): SQL {
  switch (view) {
    case "help":
    case "feedback":
      return and(eq(item.category, view), active(now))!;
    case "snoozed":
      return and(eq(item.triageStatus, "snoozed"), gt(item.snoozedUntil, now))!;
    case "dismissed":
      return eq(item.triageStatus, "dismissed");
  }
}

export type InboxItem = Awaited<ReturnType<typeof listInbox>>["items"][number];

export async function listInbox(db: Db, workspaceId: string, o: InboxOptions) {
  const now = o.now ?? new Date();
  const triaged = o.view === "snoozed" || o.view === "dismissed";
  const rows = await db
    .select({
      id: item.id,
      type: item.type,
      category: item.category,
      author: item.author,
      title: item.title,
      // Enough for the thread panel; the full thread is on HN.
      text: sql<string>`left(${item.text}, 6000)`,
      url: item.url,
      threadId: item.threadId,
      postedAt: item.postedAt,
      matchedQueryIds: item.matchedQueryIds,
      triageStatus: item.triageStatus,
      snoozedUntil: item.snoozedUntil,
      score: itemScore.score,
      criteriaMet: itemScore.criteriaMet,
      criteriaTotal: itemScore.criteriaTotal,
      criteria: itemScore.criteria,
      intent: itemScore.intent,
      reason: itemScore.reason,
    })
    .from(item)
    .innerJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(
      and(
        eq(item.workspaceId, workspaceId),
        eq(item.filterStatus, "kept"),
        viewFilter(o.view, now),
        // Triaged views show everything the user acted on, whatever the score.
        o.showLow || triaged
          ? undefined
          : sql`${itemScore.score} >= ${MIN_SCORE}`,
        o.queryId
          ? sql`${o.queryId} = any(${item.matchedQueryIds})`
          : undefined,
      ),
    )
    .orderBy(
      ...(o.view === "dismissed"
        ? [desc(item.triagedAt)]
        : o.view === "snoozed"
          ? [asc(item.snoozedUntil)]
          : o.sort === "newest"
            ? [desc(item.postedAt)]
            : [desc(itemScore.score), desc(item.postedAt)]),
      asc(item.id),
    )
    .limit(o.limit + 1);

  return { items: rows.slice(0, o.limit), hasMore: rows.length > o.limit };
}

export type InboxCounts = {
  help: number;
  feedback: number;
  helpLow: number;
  feedbackLow: number;
  snoozed: number;
  dismissed: number;
};

export async function inboxCounts(
  db: Db,
  workspaceId: string,
  now = new Date(),
): Promise<InboxCounts> {
  const n = (condition: SQL) =>
    sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
  const high = sql`${itemScore.score} >= ${MIN_SCORE}`;
  const low = sql`${itemScore.score} < ${MIN_SCORE}`;
  const [row] = await db
    .select({
      help: n(and(viewFilter("help", now), high)!),
      feedback: n(and(viewFilter("feedback", now), high)!),
      helpLow: n(and(viewFilter("help", now), low)!),
      feedbackLow: n(and(viewFilter("feedback", now), low)!),
      snoozed: n(viewFilter("snoozed", now)),
      dismissed: n(viewFilter("dismissed", now)),
    })
    .from(item)
    .innerJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(
      and(eq(item.workspaceId, workspaceId), eq(item.filterStatus, "kept")),
    );
  return row!;
}

// Items found but not scored yet: the inbox says scoring is still going.
export async function unscoredCount(
  db: Db,
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(item)
    .leftJoin(itemScore, eq(itemScore.itemId, item.id))
    .where(
      and(
        eq(item.workspaceId, workspaceId),
        eq(item.filterStatus, "kept"),
        sql`${itemScore.itemId} is null`,
      ),
    );
  return row?.n ?? 0;
}

export async function sourceHealth(db: Db, workspaceId: string) {
  const mine = and(
    eq(sourceQuery.workspaceId, workspaceId),
    eq(sourceQuery.enabled, true),
  );
  const [last] = await db
    .select({ at: max(sourceQuery.lastPolledAt) })
    .from(sourceQuery)
    .where(mine);
  const failing = await db
    .select({
      id: sourceQuery.id,
      label: sourceQuery.label,
      lastError: sourceQuery.lastError,
      lastErrorAt: sourceQuery.lastErrorAt,
    })
    .from(sourceQuery)
    .where(and(mine, isNotNull(sourceQuery.lastError)));
  return { lastCheckAt: last?.at ?? null, failing };
}

// Every keyword of the workspace, for the sidebar and "matched …" labels.
export async function keywordLabels(db: Db, workspaceId: string) {
  return db
    .select({
      id: sourceQuery.id,
      label: sourceQuery.label,
      section: sourceQuery.section,
      enabled: sourceQuery.enabled,
    })
    .from(sourceQuery)
    .where(eq(sourceQuery.workspaceId, workspaceId))
    .orderBy(asc(sourceQuery.createdAt), asc(sourceQuery.label));
}
