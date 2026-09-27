# Greer

@AGENTS.md

Open-source, self-hostable tool for small SaaS builders. It finds conversations (Hacker News first, Reddit next) where the builder can genuinely help, scores them, gives the builder a short reply brief (key ideas, angles, questions to ask), and tracks what they engaged with. The builder always writes the reply. See [PLAN.md](PLAN.md) for scope and milestones.

## Hard rules

- **Greer never posts, comments, votes or DMs on any platform.** It reads, suggests and tracks; the human posts. Don't add write-capable platform code, even behind a flag.
- **Greer never writes replies for the user.** The LLM gives ideas as short notes (key points, angles, questions to ask back, whether a product mention fits), never paste-ready sentences or full drafts. "Check my reply" may flag problems, but never rewrites the user's text. Genuine words from the builder beat AI slop; don't add a "generate reply" or "rewrite" feature, even as an option.
- **Official APIs only.** Sources use the platform's official or permitted APIs (HN: Algolia + Firebase; Reddit: the user's own approved credentials). Never add scraping services or proxy networks (Firecrawl, Apify, SerpApi, residential proxies, …), even as an optional adapter. Never use the user's logged-in session or cookies to fetch data. Every source call goes through that source's rate limiter with the shared honest User-Agent.
- **Account safety is a feature.** Guardrails (pacing, product-mention advice, eligibility) take into account the user's account maturity (age, karma) and each community's requirements. They warn, never block, since the user is the one posting.
- **Never publish the self-hosted database.** `docker-compose.yml` keeps Postgres internal and requires real secrets; only `docker-compose.dev.yml` publishes it, on 127.0.0.1.
- **Postgres is the only infrastructure dependency.** Don't add Redis, S3, a search engine or other services without discussing it first; self-hosters on Coolify pay for every extra container.
- **Every workspace-owned table has `workspace_id`** and every query filters by it, even though the UI is single-workspace today.
- **No secrets in code or logs.** LLM keys and platform credentials come from env or the encrypted settings table.

## License

- AGPL-3.0 ([LICENSE](LICENSE)). Contributions are accepted under the same license; there is no CLA.
- New dependencies must have AGPL-compatible licenses (MIT, BSD, Apache-2.0, ISC, MPL-2.0, LGPL, GPL-3.0, AGPL-3.0 are fine). Flag anything proprietary, "non-commercial", SSPL/BSL/FSL or GPL-2.0-only before adding it.
- Don't copy code from other projects without checking that its license is compatible, and credit it.

## Design stance

Build something that works and people can use now. Keep scaling in mind when designing (thin wrappers around the queue, LLM and sources; `workspace_id` everywhere), but don't build for scale, multi-tenancy or hypothetical load until a real feature needs it. Prefer the simplest solution that works for one self-hoster.

## Stack

- Next.js 16 (App Router, server components, server actions), TypeScript 5 strict. Next 16 has breaking changes vs older versions: read the bundled docs in `node_modules/next/dist/docs/` before writing Next-specific code (see AGENTS.md)
- Tailwind CSS v4 (CSS-first config in `src/app/globals.css` via `@theme`; there is no `tailwind.config.*`)
- shadcn/ui (components in `src/components/ui`, added with the CLI)
- Postgres 16 + Drizzle ORM (`src/db`)
- pg-boss for jobs and cron (`src/worker`)
- Better Auth (email + password)
- Vercel AI SDK + zod for LLM calls (`src/llm`)
- Vitest (unit + integration), Playwright (end-to-end + axe accessibility checks)
- Prettier (+ `prettier-plugin-tailwindcss` for class sorting), ESLint, pnpm as package manager
- simple-git-hooks + lint-staged run Prettier and ESLint on staged files; GitHub Actions CI runs everything below

## Layout

```
src/app/          Next.js routes (UI + /api)
src/components/   app components; ui/ = shadcn (generated)
src/db/           schema.ts, migrations/, queries
src/worker/       worker entrypoint + job handlers
src/sources/      one folder per platform adapter (implements Source)
src/llm/          provider setup, prompts/, scoring + reply briefs + reply check
src/workspace/    product profile, platform accounts, keywords + their server actions
src/onboarding/   first scan (start + progress)
src/guardrails/   account maturity tiers, pacing (pure, unit-tested)
src/lib/          shared utilities
```

## Commands

```bash
pnpm db:up          # start the dev Postgres in Docker (docker-compose.dev.yml, localhost only)
pnpm dev            # web app on :3000 (copy .env.example to .env first)
pnpm worker:dev     # background worker (pg-boss) with watch; run next to `pnpm dev`
pnpm test           # vitest unit tests
pnpm test:int       # integration tests against a real Postgres (fresh greer_test database each run)
pnpm test:e2e       # playwright end-to-end + accessibility (fresh greer_e2e database, production build on :3100)
pnpm format         # prettier --write .
pnpm format:check   # what CI runs
pnpm lint && pnpm typecheck   # typecheck runs `next typegen` first
pnpm db:generate    # drizzle-kit generate after editing src/db/schema
pnpm db:migrate     # apply migrations to DATABASE_URL
```

Self-hosting stack: `docker-compose.yml` (Postgres + web + worker, one image from `Dockerfile`; the web container runs migrations on start, the worker runs `node dist/worker.mjs`). `pnpm build:worker` bundles the worker and the migration script with esbuild.

## Conventions

- Server components by default; add `"use client"` only for interactivity.
- Mutations go through server actions that validate input with zod and check the session.
- Background work goes through `src/worker/queue.ts` (never import pg-boss elsewhere). Register new queue names in `QUEUES`. Job handlers must be idempotent (dedupe on platform `external_id`); pg-boss may retry them. Enqueue with `sendInTransaction` when the job belongs to data being written.
- Any new env var goes in `.env.example` and the README's self-hosting table in the same change.
- Formatting is Prettier's job: don't hand-format or argue with it. Run `pnpm format` before finishing a task.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, imperative and lowercase, no trailing period, e.g. `feat(inbox): add keyboard triage with undo`.

- **Types:** `feat` (user-facing feature), `fix` (bug fix), `docs` (documentation only), `chore` (maintenance, config, dependencies), `refactor` (no behavior change), `test` (tests only), `ci` (GitHub Actions), `build` (Docker, bundling), `perf` (performance), `style` (formatting only), `revert`.
- **Scope:** the area touched, e.g. `inbox`, `hn`, `llm`, `worker`, `db`, `auth`, `ui`, `docker`, `ci`, `deps`, `spike`. Omit it when a change is truly cross-cutting.
- **Breaking changes:** add `!` after the scope (`feat(db)!: …`) and a `BREAKING CHANGE:` footer explaining the upgrade path for self-hosters.
- One logical change per commit; the body explains _why_ when it isn't obvious.

## Testing

- A change isn't done until it has tests and `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` passes. Also run `pnpm test:int` / `pnpm test:e2e` when you touch the DB, jobs or UI flows.
- Tests never hit the real network: sources are tested against recorded fixtures in `src/sources/<name>/__fixtures__`, LLM code against a mocked model.
- Integration tests use a real Postgres, never a mocked DB. Each test runs in its own schema or transaction.
- Fix the code, not the test. Never delete or skip a failing test to get green without telling the user.
- Details in the `write-tests` skill.

## UI/UX

- Build UI with the `ui-component` skill: shadcn/ui + Tailwind v4, semantic tokens, accessible by default (WCAG 2.2 AA).
- Every screen handles loading, empty, error and success states. Every action gives feedback. Destructive actions can be undone.

## Skills

Project skills in `.claude/skills/` cover the recurring workflows: `add-source`, `db-change`, `llm-prompt`, `ui-component`, `write-tests`, `selfhost-check`.
