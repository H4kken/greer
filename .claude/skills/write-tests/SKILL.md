---
name: write-tests
description: Write or fix tests (Vitest unit/integration, Playwright end-to-end, LLM evals) and keep CI green. Use when adding a feature, fixing a bug, or when a test or CI check fails.
---

# Testing

## Pick the right layer

| Layer | Tool | Location | What goes here |
|---|---|---|---|
| Unit | Vitest | next to the code, `*.test.ts` | Pure logic: normalizers, prefilters, promo-ratio math, zod schemas, prompt builders |
| Integration | Vitest + real Postgres | `tests/integration/` | DB queries, server actions, pg-boss job handlers (idempotency, retries), workspace isolation |
| End-to-end | Playwright | `tests/e2e/` | Critical user flows in a real browser against `docker compose` |
| LLM evals | `pnpm eval` | `src/llm/prompts/__evals__/` | Prompt quality on labelled real posts (see the `llm-prompt` skill) |

Use the lowest layer that can catch the bug. Don't write end-to-end tests for logic a unit test covers.

## Rules

1. **Bug fix = regression test first.** Write a test that fails on the bug, then fix it.
2. **No network.** Sources use recorded fixtures, and LLM calls use the mocked model from `tests/helpers/mock-llm.ts` (it returns deterministic structured output). Playwright runs with `LLM_PROVIDER=mock`.
3. **Real Postgres, never a mocked DB,** for integration tests. Use the test helpers that create an isolated schema per test file and a factory for each table (`tests/factories/`).
4. **Workspace isolation:** every new query gets a test proving that workspace A can't read workspace B's rows.
5. **Idempotency:** every job handler gets a test that runs it twice and asserts no duplicates.
6. **Test behavior, not implementation.** Assert on outputs, DB state and what the user sees (`getByRole`, `getByLabel`), not on internal calls or CSS classes.
7. **No flaky waits.** Playwright uses auto-waiting locators and `expect(...).toBeVisible()`, never `waitForTimeout`.

## End-to-end flows that must always be covered

- Sign up → onboarding (product profile, platform username, keywords) → first ingest shows items in the inbox
- Inbox triage by keyboard: j/k, dismiss, snooze, undo
- Open thread → brief shows → write reply → check my reply → copy → "I replied" → shows in engagement history and on the person's timeline
- Settings: change LLM provider, invalid key shows a clear error
- Each flow page runs `@axe-core/playwright` with no serious or critical violations

## Before finishing

Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm test:int` / `pnpm test:e2e` if you touched the DB, jobs or UI. Report which suites ran and their results. If something fails, fix the code. Only change a test when the expected behavior really changed, and say so.
