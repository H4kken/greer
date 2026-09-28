// Triage actions on one item. Each returns false when the item isn't in the
// workspace, so callers can't touch another workspace's items.
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { item } from "@/db/schema";

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

// Undo, or "Bring back" from Hidden threads.
export function restoreItem(db: Db, workspaceId: string, itemId: string) {
  return update(db, workspaceId, itemId, {
    triageStatus: "new",
    snoozedUntil: null,
    triagedAt: null,
    dismissReason: null,
  });
}
