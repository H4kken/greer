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
  // One linked account: find the user's new comments. Keyed by workspace + platform.
  repliesPoll: "replies-poll",
  // One answer to the user's reply: ask the model how they answered.
  classifyAnswer: "classify-answer",
  // One of the user's replies: name the topic it helped with.
  nameTopic: "name-topic",
  // Every 15 minutes: how the conversations on Today are going (comments,
  // replies to the person, whether they're still around).
  refreshActivity: "refresh-activity",
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
  [QUEUES.repliesPoll]: {
    policy: "stately",
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  },
  // One waiting and one running job per reply (singletonKey = reply id).
  [QUEUES.nameTopic]: {
    policy: "stately",
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
  },
  // One waiting and one running job per answer (singletonKey = answer id).
  [QUEUES.classifyAnswer]: {
    policy: "stately",
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
  },
  // One sweep at a time; a failed one waits for the next check.
  [QUEUES.refreshActivity]: { policy: "stately", retryLimit: 0 },
  // One waiting and one running job per item (singletonKey = item id).
  [QUEUES.scoreItem]: {
    policy: "stately",
    retryLimit: 2,
    retryDelay: 60,
    retryBackoff: true,
  },
};

// One replies poll per linked account at a time.
export const repliesKey = (a: { workspaceId: string; platform: string }) =>
  `${a.workspaceId}:${a.platform}`;

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

// The web app's sender: one client per server process, reused across hot
// reloads in development. Started lazily on the first send.
const globalForQueue = globalThis as unknown as {
  greerWebQueue?: Promise<PgBoss>;
};

function webQueue(): Promise<PgBoss> {
  globalForQueue.greerWebQueue ??= (async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const boss = createQueue("client", connectionString);
    await boss.start();
    return boss;
  })().catch((error) => {
    globalForQueue.greerWebQueue = undefined; // try again on the next send
    throw error;
  });
  return globalForQueue.greerWebQueue;
}

// Sends jobs from the web app. For work the worker's schedule would pick up
// anyway (e.g. polling a new query): returns false instead of throwing when
// the queue isn't reachable yet (the worker creates it on its first start).
export async function trySendFromWeb(
  jobs: { name: QueueName; data: object; singletonKey?: string }[],
): Promise<boolean> {
  try {
    const boss = await webQueue();
    for (const job of jobs) {
      await boss.send(job.name, job.data, { singletonKey: job.singletonKey });
    }
    return true;
  } catch (error) {
    console.warn(
      "[queue] could not send from the web app, the worker's schedule will catch up:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
