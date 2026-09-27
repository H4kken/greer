import "./env";
import { db } from "@/db";
import { enabledQueryIds, pollQuery } from "@/ingest/poll";
import { getSource } from "@/sources/registry";
import {
  HEARTBEAT_CRON,
  recordHeartbeat,
  touchHeartbeatFile,
} from "./jobs/heartbeat";
import { createQueue, ensureQueues, QUEUES } from "./queue";

const INGEST_CRON = "*/15 * * * *"; // every 15 minutes

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const boss = createQueue("worker", connectionString);
  await boss.start();
  await ensureQueues(boss);

  await boss.work(QUEUES.heartbeat, async () => {
    await recordHeartbeat(db);
    await touchHeartbeatFile();
  });
  await boss.schedule(QUEUES.heartbeat, HEARTBEAT_CRON);

  await boss.work(QUEUES.ingestSchedule, async () => {
    for (const queryId of await enabledQueryIds(db)) {
      await boss.send(
        QUEUES.ingestPoll,
        { queryId },
        { singletonKey: queryId },
      );
    }
  });
  await boss.schedule(QUEUES.ingestSchedule, INGEST_CRON);

  await boss.work<{ queryId: string }>(QUEUES.ingestPoll, async ([job]) => {
    const result = await pollQuery(db, getSource, job!.data.queryId);
    console.log(`[ingest] query ${job!.data.queryId}:`, result);
  });
  await boss.send(QUEUES.heartbeat, {}); // report alive right away
  console.log("[worker] started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received, finishing active jobs…`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
