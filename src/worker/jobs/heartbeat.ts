import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { workerStatus } from "@/db/schema";

export const HEARTBEAT_CRON = "* * * * *"; // every minute

// Idempotent: always one row per process kind, only the timestamp moves.
export async function recordHeartbeat(db: Db, id = "worker"): Promise<void> {
  await db
    .insert(workerStatus)
    .values({ id, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({
      target: workerStatus.id,
      set: { lastSeenAt: sql`now()` },
    });
}
