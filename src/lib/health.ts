import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { workerStatus } from "@/db/schema";

// The heartbeat runs every minute; allow a few missed beats before alarming.
export const WORKER_STALE_AFTER_MS = 3 * 60 * 1000;

export async function checkDatabase(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function getWorkerHealth(now = new Date()) {
  const [row] = await db
    .select({ lastSeenAt: workerStatus.lastSeenAt })
    .from(workerStatus)
    .where(eq(workerStatus.id, "worker"));
  const lastSeenAt = row?.lastSeenAt ?? null;
  const healthy =
    lastSeenAt !== null &&
    now.getTime() - lastSeenAt.getTime() < WORKER_STALE_AFTER_MS;
  return { healthy, lastSeenAt };
}
