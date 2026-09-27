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
