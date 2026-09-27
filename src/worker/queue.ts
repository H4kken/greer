// The only module that talks to pg-boss directly. Everything else goes through
// these helpers, so the queue can be swapped later without touching callers.
import { sql } from "drizzle-orm";
import { fromDrizzle, PgBoss } from "pg-boss";

export const QUEUES = {
  heartbeat: "heartbeat",
  // Every 15 minutes: queue one ingest-poll per enabled source query.
  ingestSchedule: "ingest-schedule",
  // One source query: fetch, prefilter, store. Keyed by query id.
  ingestPoll: "ingest-poll",
  // One item: ask the model for its criteria, store the computed score.
  scoreItem: "score-item",
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Per-queue options applied when the queue is created.
const QUEUE_OPTIONS: Partial<
  Record<QueueName, Parameters<PgBoss["createQueue"]>[1]>
> = {
  // At most one waiting and one running poll per query (singletonKey = query id),
  // so a slow poll never piles up duplicates. Retries back off on API errors.
  [QUEUES.ingestPoll]: {
    policy: "stately",
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  },
  // One waiting and one running job per item (singletonKey = item id).
  [QUEUES.scoreItem]: {
    policy: "stately",
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
  },
};

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
    if (!(await boss.getQueue(name))) {
      await boss.createQueue(name, QUEUE_OPTIONS[name]);
    }
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
