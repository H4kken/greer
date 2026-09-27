// Triage actions on one item. Each returns false when the item isn't in the
// workspace, so callers can't touch another workspace's items.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { item } from "@/db/schema";

export const SNOOZE_MS = 24 * 60 * 60 * 1000;

async function update(
  db: Db,
  workspaceId: string,
  itemId: string,
  values: Partial<typeof item.$inferInsert>,
): Promise<boolean> {
  const rows = await db
    .update(item)
    .set(values)
    .where(and(eq(item.workspaceId, workspaceId), eq(item.id, itemId)))
    .returning({ id: item.id });
  return rows.length > 0;
}

export function dismissItem(
  db: Db,
  workspaceId: string,
  itemId: string,
  reason: string | null = null,
  now = new Date(),
) {
  return update(db, workspaceId, itemId, {
    triageStatus: "dismissed",
    snoozedUntil: null,
    triagedAt: now,
    dismissReason: reason,
  });
}

export function snoozeItem(
  db: Db,
  workspaceId: string,
  itemId: string,
  now = new Date(),
) {
  return update(db, workspaceId, itemId, {
    triageStatus: "snoozed",
    snoozedUntil: new Date(now.getTime() + SNOOZE_MS),
    triagedAt: now,
  });
}

// Undo, or "move back to the inbox" from the snoozed and dismissed views.
export function restoreItem(db: Db, workspaceId: string, itemId: string) {
  return update(db, workspaceId, itemId, {
    triageStatus: "new",
    snoozedUntil: null,
    triagedAt: null,
    dismissReason: null,
  });
}
