import "./env";
import { db } from "@/db";
import { enabledQueryIds, pollQuery } from "@/ingest/poll";
import { LlmNotConfiguredError } from "@/llm/config";
import { pollAnswers } from "@/replies/answers";
import { fillParentAuthors } from "@/replies/authors";
import { classifyReplyAnswer, unclassifiedAnswerIds } from "@/replies/classify";
import { linkedAccounts, pollReplies } from "@/replies/poll";
import { scoreItem, unscoredItemIds } from "@/scoring/score";
import { getSource } from "@/sources/registry";
import {
  HEARTBEAT_CRON,
  recordHeartbeat,
  touchHeartbeatFile,
} from "./jobs/heartbeat";
import { createQueue, ensureQueues, QUEUES, repliesKey } from "./queue";
import type { Platform } from "@/sources/types";

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

  const queueClassifying = async (answerIds: string[]) => {
    for (const answerId of answerIds) {
      await boss.send(
        QUEUES.classifyAnswer,
        { answerId },
        { singletonKey: answerId },
      );
    }
  };

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
    for (const account of await linkedAccounts(db)) {
      await boss.send(QUEUES.repliesPoll, account, {
        singletonKey: repliesKey(account),
      });
    }
    // Sweep: anything left unscored (crash, outage, LLM not configured yet).
    await queueScoring(await unscoredItemIds(db));
    await queueClassifying(await unclassifiedAnswerIds(db));
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

  await boss.work<{ workspaceId: string; platform: Platform }>(
    QUEUES.repliesPoll,
    async ([job]) => {
      const { workspaceId, platform } = job!.data;
      const replies = await pollReplies(db, getSource, workspaceId, platform);
      const authors = await fillParentAuthors(
        db,
        getSource,
        workspaceId,
        platform,
      );
      const { newIds, ...answers } = await pollAnswers(
        db,
        getSource,
        workspaceId,
        platform,
      );
      console.log(`[replies] ${repliesKey(job!.data)}:`, {
        replies,
        authors,
        answers,
      });
      await queueClassifying(newIds);
    },
  );

  await boss.work<{ answerId: string }>(
    QUEUES.classifyAnswer,
    { localConcurrency: 4 },
    async ([job]) => {
      try {
        await classifyReplyAnswer(db, job!.data.answerId);
      } catch (error) {
        // Same as scoring: the sweep picks it up once a model is set.
        if (error instanceof LlmNotConfiguredError) {
          console.warn(`[classify] ${error.message}`);
          return;
        }
        throw error;
      }
    },
  );

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
