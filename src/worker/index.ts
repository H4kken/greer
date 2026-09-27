import "./env";
import { db } from "@/db";
import { enabledQueryIds, pollQuery } from "@/ingest/poll";
import { LlmNotConfiguredError } from "@/llm/config";
import { scoreItem, unscoredItemIds } from "@/scoring/score";
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

  const queueScoring = async (itemIds: string[]) => {
    for (const itemId of itemIds) {
      await boss.send(QUEUES.scoreItem, { itemId }, { singletonKey: itemId });
    }
  };

  await boss.work(QUEUES.ingestSchedule, async () => {
    for (const queryId of await enabledQueryIds(db)) {
      await boss.send(
        QUEUES.ingestPoll,
        { queryId },
        { singletonKey: queryId },
      );
    }
    // Sweep: anything left unscored (crash, outage, LLM not configured yet).
    await queueScoring(await unscoredItemIds(db));
  });
  await boss.schedule(QUEUES.ingestSchedule, INGEST_CRON);

  await boss.work<{ queryId: string }>(QUEUES.ingestPoll, async ([job]) => {
    const { newKeptIds, ...counts } = await pollQuery(
      db,
      getSource,
      job!.data.queryId,
    );
    console.log(`[ingest] query ${job!.data.queryId}:`, counts);
    await queueScoring(newKeptIds);
  });

  await boss.work<{ itemId: string }>(
    QUEUES.scoreItem,
    { localConcurrency: 4 },
    async ([job]) => {
      try {
        const outcome = await scoreItem(db, job!.data.itemId);
        if (outcome.status === "skipped") {
          console.log(
            `[score] item ${job!.data.itemId} skipped: ${outcome.reason}`,
          );
        }
      } catch (error) {
        // Retrying won't help until a key is set; the sweep picks the item
        // up again once the LLM is configured.
        if (error instanceof LlmNotConfiguredError) {
          console.warn(`[score] ${error.message}`);
          return;
        }
        throw error;
      }
    },
  );

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
