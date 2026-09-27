// The only module that talks to pg-boss directly. Everything else goes through
// these helpers, so the queue can be swapped later without touching callers.
import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";

export const QUEUES = {
  heartbeat: "heartbeat",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

type Role = "worker" | "client";

// worker: runs jobs, cron schedules, maintenance and pg-boss's own migrations.
// client: only sends jobs (the web app), so scheduling and maintenance run once.
export function createQueue(role: Role, connectionString: string): PgBoss {
  const isWorker = role === "worker";
  const boss = new PgBoss({
    connectionString,
    application_name: `greer-${role}`,
    schedule: isWorker,
    supervise: isWorker,
    migrate: isWorker,
  });
  boss.on("error", (error) => console.error("[queue]", error));
  return boss;
}

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name);
  }
}

type DrizzleTx = Parameters<typeof fromDrizzle>[0];

// Enqueue a job inside an existing Drizzle transaction: the job exists if and
// only if the transaction commits.
export function sendInTransaction(
  boss: PgBoss,
  tx: DrizzleTx,
  name: QueueName,
  data: object,
  options: { singletonKey?: string } = {},
) {
  return boss.send(name, data, { ...options, db: fromDrizzle(tx, sql) });
}
