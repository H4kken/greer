import { writeFile } from "node:fs/promises";
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

// Container healthcheck target (see docker-compose.yml): the worker has no HTTP
// server, so it touches this file on every heartbeat.
export const HEARTBEAT_FILE =
  process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/greer-worker-heartbeat";

export async function touchHeartbeatFile(path = HEARTBEAT_FILE): Promise<void> {
  await writeFile(path, new Date().toISOString());
}
