// Puts scored threads in the e2e database, as the worker would after a scan
// (no worker runs during e2e).
import { Client } from "pg";
import { E2E_DATABASE_URL } from "../helpers/db.ts";

export type SeedThread = {
  title: string;
  score: number;
  category?: "help" | "feedback";
};

export async function seedThreads(threads: SeedThread[]): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      "select id from workspace order by created_at limit 1",
    );
    const workspaceId = rows[0]!.id;
    for (const [i, t] of threads.entries()) {
      const id = crypto.randomUUID();
      await client.query(
        `insert into item (id, workspace_id, platform, external_id, type, author, title, text, url, thread_id, posted_at, category, filter_status, matched_query_ids, raw)
         values ($1, $2, 'hn', $3, 'story', 'founder', $4, 'I launched a month ago and have no paying customers. What would you try next?', $5, $3, now() - ($6 || ' hours')::interval, $7, 'kept', '{}', '{}')`,
        [
          id,
          workspaceId,
          String(90000 + i),
          t.title,
          `https://news.ycombinator.com/item?id=${90000 + i}`,
          String(i + 1),
          t.category ?? "help",
        ],
      );
      await client.query(
        `insert into item_score (item_id, workspace_id, score, criteria_met, criteria_total, criteria, intent, reason, prompt_version, model)
         values ($1, $2, $3, 4, 5, $4, 'asking_for_help', $5, 'seed', 'mock-fast')`,
        [
          id,
          workspaceId,
          t.score,
          JSON.stringify({
            own_situation: true,
            seeking_help: true,
            problem_match: "strong",
            matched_problem: 1,
            specific: true,
            reply_welcome: false,
          }),
          `Seeded: ${t.title}`,
        ],
      );
    }
  } finally {
    await client.end();
  }
}

// One of the owner's replies with an answer, as the worker would store it.
// `n` keeps several seeded conversations apart: ids 80000 + 10n onwards.
export async function seedAnswer(
  answer: {
    author: string;
    text: string;
    tone: "question" | "thanks" | "disagreement" | "neutral";
  },
  {
    n = 0,
    parentAuthor = null as string | null,
    topic = null as string | null,
  } = {},
): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  const id = (k: number) => String(80000 + 10 * n + k);
  try {
    const { rows } = await client.query<{ id: string }>(
      "select id from workspace order by created_at limit 1",
    );
    const workspaceId = rows[0]!.id;
    const replyId = crypto.randomUUID();
    await client.query(
      `insert into reply (id, workspace_id, platform, external_id, parent_external_id, parent_author, thread_external_id, thread_title, text, url, posted_at, raw)
       values ($1, $2, 'hn', $3, $4, $5, $4, 'Ask HN: How do you get your first users?', 'I answered questions where they hang out.', $6, now() - interval '5 hours', '{}')`,
      [
        replyId,
        workspaceId,
        id(1),
        id(0),
        parentAuthor,
        `https://news.ycombinator.com/item?id=${id(1)}`,
      ],
    );
    if (topic) {
      await client.query(
        `insert into topic (id, workspace_id, name) values ($1, $2, $3) on conflict do nothing`,
        [crypto.randomUUID(), workspaceId, topic],
      );
      await client.query(
        `update reply set topic_id = (select id from topic where workspace_id = $2 and lower(name) = lower($3)) where id = $1`,
        [replyId, workspaceId, topic],
      );
    }
    await client.query(
      `insert into reply_answer (id, workspace_id, reply_id, platform, external_id, author, text, url, posted_at, tone)
       values ($1, $2, $3, 'hn', $4, $5, $6, $7, now() - interval '2 hours', $8)`,
      [
        crypto.randomUUID(),
        workspaceId,
        replyId,
        id(2),
        answer.author,
        answer.text,
        `https://news.ycombinator.com/item?id=${id(2)}`,
        answer.tone,
      ],
    );
  } finally {
    await client.end();
  }
}

// Links an HN account without calling HN, as the Accounts page would.
export async function seedAccount(handle: string): Promise<void> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `insert into platform_account (workspace_id, platform, handle, account_created_at, karma, refreshed_at)
       select id, 'hn', $1, now() - interval '3 years', 1200, now() from workspace order by created_at limit 1
       on conflict do nothing`,
      [handle],
    );
  } finally {
    await client.end();
  }
}
