import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { workerStatus } from "@/db/schema";
import { getWorkerHealth, WORKER_STALE_AFTER_MS } from "@/lib/health";
import { recordHeartbeat } from "@/worker/jobs/heartbeat";
import {
  createQueue,
  ensureQueues,
  QUEUES,
  sendInTransaction,
} from "@/worker/queue";
import { truncateAll } from "../helpers/truncate";

async function waitFor<T>(fn: () => Promise<T | null | undefined>) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out waiting for condition");
}

describe("heartbeat", () => {
  beforeEach(truncateAll);

  it("keeps a single row and moves its timestamp (idempotent)", async () => {
    await recordHeartbeat(db);
    const [first] = await db.select().from(workerStatus);
    await new Promise((r) => setTimeout(r, 20));
    await recordHeartbeat(db);

    const rows = await db.select().from(workerStatus);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThan(
      first!.lastSeenAt.getTime(),
    );
  });

  it("reports the worker healthy only while heartbeats are recent", async () => {
    expect((await getWorkerHealth()).healthy).toBe(false); // never seen

    await recordHeartbeat(db);
    expect((await getWorkerHealth()).healthy).toBe(true);

    const later = new Date(Date.now() + WORKER_STALE_AFTER_MS + 1000);
    expect((await getWorkerHealth(later)).healthy).toBe(false);
  });
});

describe("queue (real pg-boss)", () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = createQueue("worker", process.env.DATABASE_URL!);
    await boss.start();
    await ensureQueues(boss);
    await boss.work(QUEUES.heartbeat, { pollingIntervalSeconds: 0.5 }, () =>
      recordHeartbeat(db),
    );
  });
  afterAll(() => boss.stop({ graceful: false }));
  beforeEach(truncateAll);

  it("runs a sent job through the worker", async () => {
    await boss.send(QUEUES.heartbeat, {});
    const row = await waitFor(
      async () => (await db.select().from(workerStatus))[0],
    );
    expect(row.id).toBe("worker");
  });

  it("only creates a job sent in a transaction if that transaction commits", async () => {
    const countJobs = async () => {
      const result = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from pgboss.job where name = ${QUEUES.heartbeat}`,
      );
      return result.rows[0]!.n;
    };
    const before = await countJobs();

    await expect(
      db.transaction(async (tx) => {
        await sendInTransaction(boss, tx, QUEUES.heartbeat, {});
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await countJobs()).toBe(before);

    await db.transaction(async (tx) => {
      await sendInTransaction(boss, tx, QUEUES.heartbeat, {});
    });
    expect(await countJobs()).toBe(before + 1);
  });
});
