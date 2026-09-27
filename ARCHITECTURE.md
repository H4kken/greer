# Architecture

This page describes how Greer is built today. It's for contributors, and for self-hosters who want to know what runs on their server. For what Greer does and why, see [README.md](README.md). For where it's going, see [PLAN.md](PLAN.md).

## The big picture

```
                 ┌──────────── one Docker image ────────────┐
 browser ──────► │ web     Next.js: pages, server actions,  │
                 │         /api/auth, /api/health           │
                 │                                          │
                 │ worker  node dist/worker.mjs: pg-boss     │ ──► HN APIs (Algolia, Firebase)
                 │         jobs and cron                     │ ──► LLM provider (Anthropic, OpenAI, Ollama)
                 └───────────────────┬──────────────────────┘
                                     │
                                  Postgres  (app data + auth + job queue)
```

- **One image, two processes.** `web` and `worker` run the same image with different commands (see [docker-compose.yml](docker-compose.yml)). The web container applies migrations when it starts.
- **Postgres is the only infrastructure.** The job queue ([pg-boss](https://github.com/timgit/pg-boss)) lives in Postgres too. Web and worker never talk to each other directly: they share the database, and the web app can enqueue jobs.
- **Greer only reads.** No code path posts, votes or messages on any platform. The builder writes and posts every reply themselves.

## The core loop in code

```
onboarding ──► source_query rows
                    │
   every 15 min     ▼
ingest-schedule ──► ingest-poll (one per query) ──► item rows (prefiltered)
                                                        │ new "kept" items
                                                        ▼
                                                   score-item ──► item_score rows
                                                                      │
                                                                      ▼
                                                     inbox (ranked, triaged by the user)
```

1. **Onboarding** ([src/app/(onboarding)](<src/app/(onboarding)>), [src/workspace](src/workspace), [src/onboarding](src/onboarding)) saves the product profile, the user's HN account and the keywords. Each keyword becomes a `source_query` row. Starting the first scan enqueues one poll per query right away, instead of waiting for the next scheduled run.
2. **Scheduling** ([src/worker/index.ts](src/worker/index.ts)): `ingest-schedule` runs every 15 minutes. It enqueues one `ingest-poll` job per enabled query, then a "sweep" that re-enqueues any kept item that still has no score (after a crash, an API outage, or before an LLM key was set).
3. **Polling** ([src/ingest/poll.ts](src/ingest/poll.ts)) runs one query through its source adapter. The first poll fetches the last 7 days; later polls fetch since the last poll, with a one-hour overlap. Items are upserted on `(workspace, platform, external_id)`, so running a poll twice is harmless.
4. **Prefilter** ([src/ingest/prefilter.ts](src/ingest/prefilter.ts)): cheap, deterministic rules run before any LLM call and set `filter_status` (dead, the user's own posts, hiring threads, too short). Filtered items are still stored, so the scan page's counts stay honest. Show HN posts get the `feedback` category; everything else is `help`.
5. **Scoring** ([src/scoring](src/scoring)): one `score-item` job per new kept item. The model answers a few yes/no and enum criteria ([src/llm/prompts/score-help.ts](src/llm/prompts/score-help.ts), [score-launch.ts](src/llm/prompts/score-launch.ts)). Code then turns the answers into a 0–100 score ([compute.ts](src/scoring/compute.ts)). Keeping the weights in code means they can change without asking the model again, and the inbox can explain every score ([explain.ts](src/scoring/explain.ts)).
6. **Inbox** ([src/inbox](src/inbox), [src/app/(app)/inbox](<src/app/(app)/inbox>)) lists scored threads above a threshold, ranked by score. The user triages them: dismiss, snooze or undo. Triage state lives on the `item` row.

## Processes

### Web (Next.js 16, App Router)

- **Server components** fetch data directly from the database. `"use client"` is only used for interactivity (forms, the inbox's keyboard triage).
- **Mutations are server actions** ([src/workspace/actions.ts](src/workspace/actions.ts), [src/inbox/actions.ts](src/inbox/actions.ts)). Each one checks the session with `requireWorkspace()`, validates its input with zod, and only touches rows of the user's workspace.
- **[src/proxy.ts](src/proxy.ts)** (Next 16's replacement for middleware) redirects requests that have no session cookie. Pages still validate the session themselves; the proxy is only a fast first check.
- **Auth** is [Better Auth](https://www.better-auth.com) with email and password ([src/lib/auth.ts](src/lib/auth.ts)). The first account becomes the owner and creates the workspace. After that, registration is closed unless `ALLOW_REGISTRATION=true`.
- **UI state that should survive a reload lives in the URL**, e.g. the inbox view, filter, sort and selected thread ([src/inbox/url.ts](src/inbox/url.ts)).

### Worker

- A plain Node process, bundled with esbuild into `dist/worker.mjs` ([scripts/build-worker.mjs](scripts/build-worker.mjs)).
- It registers the job handlers and cron schedules, and shuts down gracefully on SIGTERM.
- **Liveness:** a `heartbeat` job runs every minute. It writes `worker_status` (shown by `/api/health`) and touches a file that the container healthcheck reads.

### Jobs

All queue access goes through [src/worker/queue.ts](src/worker/queue.ts); nothing else imports pg-boss.

| Queue             | When                                    | What                                                       | Retries                            |
| ----------------- | --------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `heartbeat`       | every minute                            | record worker liveness                                     | no                                 |
| `ingest-schedule` | every 15 minutes                        | enqueue one poll per enabled query, plus the scoring sweep | no                                 |
| `ingest-poll`     | from the schedule, onboarding, Settings | fetch, prefilter and store one query's results             | 3, with backoff                    |
| `score-item`      | after a poll, from the sweep            | score one item (4 at a time)                               | 2, with backoff; not without a key |

- **Handlers are idempotent.** pg-boss may retry them, and they dedupe on the platform's `external_id`.
- **Stately queues with a `singletonKey`** (the query or item id) keep at most one waiting and one running job per key, so slow polls never pile up.
- **Sending from the web app** (`trySendFromWeb`) is best effort. If the worker has never started, the send fails quietly and the next scheduled run picks the work up.

## Code layout

```
src/app/          routes: (auth), (onboarding), (app) = inbox + settings, api/
src/components/   UI by feature; ui/ = shadcn (generated, don't edit by hand)
src/workspace/    product profile, platform accounts, keywords + their server actions
src/onboarding/   first scan: start it, report progress
src/inbox/        inbox queries, triage, URL params, server actions
src/ingest/       poll one query, prefilter
src/scoring/      score one item, compute and explain scores
src/llm/          provider-neutral LLM layer, prompts/, evals
src/sources/      one folder per platform (hn/), shared HTTP client, registry
src/guardrails/   account maturity tiers and pacing (pure functions)
src/worker/       worker entry point, queue wrapper, jobs
src/db/           Drizzle schema, migrations, connection
src/lib/          auth, session, crypto, env, time and other shared helpers
```

Dependencies point one way: **`app` / `components` → feature modules (`workspace`, `inbox`, `onboarding`, `scoring`, `ingest`) → `llm`, `sources`, `guardrails` → `db`, `lib`.**

Feature modules export plain functions that take `db` as a parameter. The same functions serve the pages, the server actions, the worker and the integration tests.

## Data model

All tables are defined in [src/db/schema/app.ts](src/db/schema/app.ts); Better Auth's tables are in [auth.ts](src/db/schema/auth.ts).

| Table              | Holds                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `workspace`        | the product profile (name, description, audience, problems) and `onboarded_at`                            |
| `workspace_member` | who belongs to the workspace (owner or member)                                                            |
| `platform_account` | the user's own account per platform: handle, account age, karma, used for maturity tiers                  |
| `source_query`     | one saved search: keyword, section (Ask HN, all stories and comments, Show HN), last poll, last error     |
| `item`             | a post or comment found by a query: text, category, `filter_status`, the matching query ids, triage state |
| `item_score`       | the latest score of an item: the model's criteria, the computed score, reason, prompt version, model      |
| `llm_settings`     | the provider and models saved in Settings; the API key is encrypted                                       |
| `llm_call`         | one row per model call: tokens, duration, errors (for cost display and debugging)                         |
| `worker_status`    | the worker's last heartbeat                                                                               |

- **Every workspace-owned table has `workspace_id`**, and every query filters on it. The UI has a single workspace today; this keeps a multi-workspace version possible.
- **Migrations** are generated by drizzle-kit into [src/db/migrations](src/db/migrations) and never edited once committed. They must be safe to run on a database with real data, because self-hosters upgrade across several versions at once.

## LLM layer

All model calls go through `generateStructured(workspaceId, prompt, input)` in [src/llm/client.ts](src/llm/client.ts). Nothing else imports a provider SDK.

- **Prompts** live in [src/llm/prompts](src/llm/prompts). Each one is a `definePrompt({ name, version, slot, system, build, schema, mock })`.
  - `schema` is a zod object used for structured output.
  - `slot` is `fast` (scoring, keyword suggestions) or `quality` (reply briefs, coming next).
  - `mock` gives a deterministic answer when `LLM_PROVIDER=mock`, which the tests and the e2e run use.
- **Configuration** ([config.ts](src/llm/config.ts), [settings.ts](src/llm/settings.ts)): settings saved in the UI win over environment variables. Only Anthropic has default models; other providers need both model names.
- **Every call is logged** in `llm_call`, and scores store the `prompt_version`. That makes cost visible in Settings and lets results from different prompt versions be compared.
- **Platform content is untrusted.** It is wrapped with `untrusted()` in delimited blocks, and every system prompt tells the model never to follow instructions found inside it.
- **Evals:** [src/llm/prompts/\_\_evals\_\_](src/llm/prompts/__evals__) holds labeled real threads. `pnpm eval` runs a prompt against a real key and reports precision and recall.
- **No prompt ever writes reply text.** Greer gives ideas; the builder writes the words.

## Sources

A source adapter implements the read-only `Source` interface in [src/sources/types.ts](src/sources/types.ts): `fetchNew`, `fetchThread`, `permalink`, and optionally `fetchAccount` and `itemStatus`. Adapters are listed in [registry.ts](src/sources/registry.ts).

- **Hacker News** ([src/sources/hn](src/sources/hn)) uses the Algolia search API for keyword search and the official Firebase API for user profiles and dead/deleted flags. Both are free, public and need no key.
- **Every request** goes through the shared client in [http.ts](src/sources/http.ts). It sends an honest User-Agent, spaces requests to the same host, and retries on 429 and 5xx, honoring `Retry-After`.
- **Only official or permitted APIs.** No scraping services, no proxies, never the user's logged-in session.

## Security and trust boundaries

- **Secrets:** LLM keys saved in Settings are encrypted with AES-256-GCM, using a key derived from `BETTER_AUTH_SECRET` ([src/lib/crypto.ts](src/lib/crypto.ts)). The UI only ever shows a masked version. Keys never appear in logs.
- **The database is never published** by the self-hosting compose file; only the web port is. `docker-compose.dev.yml` publishes Postgres on 127.0.0.1 for development only.
- **Workspace isolation:** every write filters on `workspace_id`, and actions return "not found" for another workspace's ids. Integration tests check this.
- **Guardrails warn, never block.** Account maturity ([src/guardrails/maturity.ts](src/guardrails/maturity.ts)) changes pacing and product-mention advice; the user decides what to post.

## Configuration and startup

- **Environment variables** are listed in [.env.example](.env.example) and in the README's self-hosting table.
- **Empty means unset.** Docker compose passes unset optional variables as empty strings, so both processes drop empty variables at startup ([src/lib/env.ts](src/lib/env.ts), called from [src/worker/env.ts](src/worker/env.ts) and [src/instrumentation.ts](src/instrumentation.ts)).
- **Startup order in Docker:** Postgres becomes healthy, then web runs the migrations (`dist/migrate.mjs`) and serves, then the worker starts once web is healthy.

## Testing

| Layer       | Tool                          | Covers                                                                                                                |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest, next to the code      | pure logic: normalizers, prefilter, score math, maturity tiers, schemas, prompt builders                              |
| Integration | Vitest, `tests/integration`   | real Postgres (fresh `greer_test` database): polls, scoring with the mock model, inbox queries, isolation             |
| End-to-end  | Playwright + axe, `tests/e2e` | production build on a fresh `greer_e2e` database: sign-up, onboarding, settings, inbox triage, phone width, dark mode |
| LLM quality | `pnpm eval`                   | prompt precision and recall against labeled real threads                                                              |

Tests never hit the network: sources are tested against recorded fixtures, and LLM code against the mock provider. CI runs all of the above except evals, plus a smoke test that starts the self-hosting stack in Docker.

## Adding things

Step-by-step guides live in [.claude/skills](.claude/skills). They're written for Claude Code but work as checklists for anyone.

| To add…                     | Start with                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| a platform (e.g. Reddit)    | [add-source](.claude/skills/add-source/SKILL.md)                                                                       |
| a table or column           | [db-change](.claude/skills/db-change/SKILL.md)                                                                         |
| a prompt or a change to one | [llm-prompt](.claude/skills/llm-prompt/SKILL.md)                                                                       |
| a screen or component       | [ui-component](.claude/skills/ui-component/SKILL.md)                                                                   |
| a background job            | a queue name in `QUEUES` ([queue.ts](src/worker/queue.ts)) and a handler in [src/worker/index.ts](src/worker/index.ts) |
| tests                       | [write-tests](.claude/skills/write-tests/SKILL.md)                                                                     |
