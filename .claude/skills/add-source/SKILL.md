---
name: add-source
description: Add or modify a platform source adapter (Reddit, Hacker News, Bluesky, ...) under src/sources. Use when adding a new platform, a new access mode (e.g. API credentials vs bookmarklet), or changing how items are ingested.
---

# Adding a source adapter

1. **Check access first.** Before writing code, confirm the platform's current terms and the access method (official API, open firehose, user-provided credentials). Write the findings, rate limits and required credentials at the top of `src/sources/<name>/README.md`. Only official or explicitly permitted APIs qualify. Scraping services and proxy networks (Firecrawl, Apify, SerpApi, residential proxies), unauthenticated scraping disallowed by robots.txt, and the user's logged-in session are all off-limits. If there's no permitted option, stop and tell the user.
2. **Read-only.** Implement only the `Source` interface from `src/sources/types.ts` (`fetchNew`, `fetchThread`, `permalink`, plus the optional `fetchAccount` for age/karma, `fetchRules`, `findUserReply` and `itemStatus` for dead/removed detection; implement every one the platform supports, since account-aware guardrails depend on them). Never add posting, voting or messaging.
3. **Structure:**
   ```
   src/sources/<name>/
     index.ts          adapter implementing Source
     client.ts         HTTP calls, wrapped in the shared rate limiter + User-Agent
     normalize.ts      platform payload -> RawItem (pure, unit-tested)
     __fixtures__/     recorded real responses (strip any tokens)
     <name>.test.ts
   ```
4. **Normalize carefully:** stable `external_id`, the author handle, `created_at` in UTC, a canonical permalink, and the raw payload kept in `raw`.
5. **Register** the adapter in `src/sources/registry.ts` and add its id to the `platform` enum in `src/db/schema.ts` (follow the `db-change` skill).
6. **Config:** any credentials are optional env vars documented in `.env.example` and the README. The adapter must degrade gracefully (clear error in the UI, no worker crash loop) when credentials are missing or the platform rate-limits.
7. **Test** `normalize.ts` against fixtures and the poll job for idempotency (running it twice inserts nothing new). Run `pnpm test && pnpm typecheck`.
