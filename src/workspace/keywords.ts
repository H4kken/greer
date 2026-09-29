// Saved HN searches (source_query rows). Help keywords search Ask HN or all
// stories and comments; Show HN launches are one query with no keyword.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { sourceQuery } from "@/db/schema";
import type { KeywordInput } from "./schemas";

export const SHOW_HN_SECTION = "show_hn";
const SHOW_HN_LABEL = "Show HN launches";
const HELP_SECTIONS = ["ask_hn", "story_comment"];

// A Db or a transaction: both can run these queries.
type Tx = Pick<Db, "select" | "insert" | "update" | "delete">;

export type SavedQuery = typeof sourceQuery.$inferSelect;

export async function listHnQueries(
  db: Tx,
  workspaceId: string,
): Promise<SavedQuery[]> {
  return db
    .select()
    .from(sourceQuery)
    .where(
      and(
        eq(sourceQuery.workspaceId, workspaceId),
        eq(sourceQuery.platform, "hn"),
      ),
    )
    .orderBy(asc(sourceQuery.createdAt), asc(sourceQuery.label));
}

const keyOf = (k: { section: string; query: string }) =>
  `${k.section}:${k.query.toLowerCase()}`;

// Makes the workspace's HN queries match the list chosen during onboarding:
// adds new ones, removes the ones taken out, keeps the rest (and their poll
// history). Returns the ids of every enabled query.
export async function syncHnQueries(
  db: Tx,
  workspaceId: string,
  keywords: KeywordInput[],
  showHn: boolean,
): Promise<string[]> {
  const existing = await listHnQueries(db, workspaceId);
  const wanted = new Map(keywords.map((k) => [keyOf(k), k]));

  const toDelete = existing.filter((q) =>
    q.section === SHOW_HN_SECTION
      ? !showHn
      : HELP_SECTIONS.includes(q.section) && !wanted.has(keyOf(q)),
  );
  if (toDelete.length) {
    await db.delete(sourceQuery).where(
      inArray(
        sourceQuery.id,
        toDelete.map((q) => q.id),
      ),
    );
  }

  const have = new Set(existing.map(keyOf));
  const toInsert: { query: string; section: string; label: string }[] = [
    ...wanted.values(),
  ]
    .filter((k) => !have.has(keyOf(k)))
    .map((k) => ({ ...k, label: k.query }));
  if (showHn && !existing.some((q) => q.section === SHOW_HN_SECTION)) {
    toInsert.push({
      query: "",
      section: SHOW_HN_SECTION,
      label: SHOW_HN_LABEL,
    });
  }
  if (toInsert.length) {
    await db
      .insert(sourceQuery)
      .values(
        toInsert.map((q) => ({ workspaceId, platform: "hn" as const, ...q })),
      );
  }

  const after = await listHnQueries(db, workspaceId);
  return after.filter((q) => q.enabled).map((q) => q.id);
}

// Starts watching Show HN (every launch, no keyword), or returns the row
// that already does.
export async function watchShowHn(
  db: Tx,
  workspaceId: string,
): Promise<SavedQuery> {
  const existing = await listHnQueries(db, workspaceId);
  const found = existing.find((q) => q.section === SHOW_HN_SECTION);
  if (found) return found;
  const [row] = await db
    .insert(sourceQuery)
    .values({
      workspaceId,
      platform: "hn",
      query: "",
      section: SHOW_HN_SECTION,
      label: SHOW_HN_LABEL,
    })
    .returning();
  return row!;
}

export async function addHnKeyword(
  db: Tx,
  workspaceId: string,
  keyword: KeywordInput,
): Promise<SavedQuery | "duplicate"> {
  const existing = await listHnQueries(db, workspaceId);
  if (existing.some((q) => keyOf(q) === keyOf(keyword))) return "duplicate";
  const [row] = await db
    .insert(sourceQuery)
    .values({ workspaceId, platform: "hn", label: keyword.query, ...keyword })
    .returning();
  return row!;
}

export async function setQueryEnabled(
  db: Tx,
  workspaceId: string,
  queryId: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(sourceQuery)
    .set({ enabled })
    .where(
      and(
        eq(sourceQuery.workspaceId, workspaceId),
        eq(sourceQuery.id, queryId),
      ),
    )
    .returning({ id: sourceQuery.id });
  return rows.length > 0;
}

// Returns the deleted row, so the UI can offer "Undo" (see restoreQuery).
export async function deleteQuery(
  db: Tx,
  workspaceId: string,
  queryId: string,
): Promise<SavedQuery | null> {
  const [row] = await db
    .delete(sourceQuery)
    .where(
      and(
        eq(sourceQuery.workspaceId, workspaceId),
        eq(sourceQuery.id, queryId),
      ),
    )
    .returning();
  return row ?? null;
}

// Puts a deleted query back with the same id, so items it found keep
// pointing at it. Its poll history is gone: the next poll backfills, and
// items already stored are deduplicated.
export async function restoreQuery(
  db: Tx,
  workspaceId: string,
  query: { id: string; section: string; query: string; enabled: boolean },
): Promise<void> {
  await db
    .insert(sourceQuery)
    .values({
      ...query,
      workspaceId,
      platform: "hn",
      label: query.section === SHOW_HN_SECTION ? SHOW_HN_LABEL : query.query,
    })
    .onConflictDoNothing();
}
