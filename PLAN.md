# Greer — v1 Plan

> Open-source, self-hostable tool that helps small SaaS builders find conversations where they can genuinely help, and engage with those people by hand.

## Decisions so far

| Question         | Decision                                                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope            | **Listen + engage.** Find relevant conversations, score them, give you a reply brief (ideas, not text), track what you engaged with. No community hosting, no full CRM.                                                                                                                                                    |
| Platforms        | **v0.1: Hacker News** (free, official APIs). **v0.2: Reddit**, with the user's own approved API credentials plus a "bring a thread" fallback. Every platform sits behind a source-adapter interface.                                                                                                                       |
| Data access      | **Official APIs only.** No scraping services, proxies or logged-in sessions (see [Data access policy](#data-access-policy)).                                                                                                                                                                                               |
| Automation       | **Human-in-the-loop.** The tool finds threads and suggests ideas. You write the reply, open the thread and post it yourself. The tool never posts and never writes the reply.                                                                                                                                              |
| Account safety   | **Account-aware guardrails.** Pacing, product mentions and eligibility depend on your account's age and karma and on each community's requirements.                                                                                                                                                                        |
| Stack            | **TypeScript full-stack.** Next.js + Postgres + worker, shipped as one Docker image.                                                                                                                                                                                                                                       |
| Hosting          | Docker Compose, deployable to Coolify in one step.                                                                                                                                                                                                                                                                         |
| License          | **AGPL-3.0, no CLA.** Keeps improvements open, including in hosted forks. Contributions come in under the AGPL (inbound = outbound). A CLA can be added later if a closed or relicensed edition is ever needed; it would only cover new contributions.                                                                     |
| Design stance    | Build what works for one self-hoster now. Keep scaling in mind (thin wrappers, `workspace_id`), but don't build for scale until a feature needs it.                                                                                                                                                                        |
| Show HN launches | **Separate category.** Scored as "feedback opportunities" in their own inbox tab, so they don't crowd threads where someone asks for help.                                                                                                                                                                                 |
| LLM key          | **Env var or settings page.** `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the environment still work; a settings page can also store a key in the database, encrypted with AES-256-GCM using a key derived from `BETTER_AUTH_SECRET` (rotating that secret means re-entering the key). A key set in the UI takes precedence. |
| Polling          | **Every 15 minutes, 7 days of backfill** on first setup. Only new posts get scored, so frequency barely affects LLM cost. Both configurable per workspace later.                                                                                                                                                           |

## Product principles

These are what make it different from the "AI Reddit marketing" spam tools.

1. **Your words, not AI slop.** Greer never writes the reply. It gives ideas as short notes (key points, angles, questions to ask back) so you write something genuine in your own words, faster. Communities spot AI-written replies immediately, and they damage your reputation.
2. **Help first, pitch rarely.** Briefs start from the person's actual problem. The product is mentioned only when it clearly helps, and always with disclosure ("I built X").
3. **Never posts for you.** Keeps accounts safe, keeps replies genuine, and removes any need for write access.
4. **Respect each community.** Show the community's rules next to every reply you write. Track how often you mention your product per community. Enforce cooldowns.
5. **Know your account.** A 2-week-old account and a 5-year-old account with 10k karma aren't the same. Greer adapts pacing, product-mention advice and which threads it surfaces to your account's maturity and to each community's entry requirements.
6. **Your data, your keys.** Self-hosted, bring your own LLM key (OpenAI, Anthropic, or any OpenAI-compatible endpoint such as Ollama).
7. **Rewarding, not a chore.** Community building should feel like meeting people, not clearing an inbox. Greer rewards only what people do back (a thanks, a follow-up question, someone coming back), never reply count, so the fun and genuine replies point the same way. Calm and warm: no guilt streaks, no leaderboards.

## Core loop

```
Setup → Ingest → Filter → Score → Inbox → Brief → You write & post → Track
```

1. **Setup (onboarding):**
   - Describe your product, ICP and the problems you solve.
   - Add **founder context**: short notes on your real experience (what you built, what failed, the stack you use, lessons learned). This is the raw material the brief points you back to.
   - Link your **platform account** (HN username). Greer reads its public age and karma.
   - Pick keywords and sections (Ask HN, Show HN, all stories, comments). The LLM suggests keywords from the product description.
2. **Ingest:** a worker polls each keyword query on a schedule and dedupes by platform ID.
3. **Filter (cheap):** a keyword/regex prefilter plus basic rules (post age < 48h, thread not dead, not from you, you're eligible to comment). This keeps LLM costs low.
4. **Score (LLM, cheap model):** relevance 0–100, intent type (asking for a tool / describing a pain / discussion / competitor mention), a one-line "why this matters", and a "can I help without pitching?" flag.
5. **Inbox:** a ranked list of threads showing why each was surfaced, with the community rules shown alongside. Actions: open / snooze / dismiss (dismissals feed back into scoring as few-shot negatives). For a new account, threads where plain help is the right move rank higher.
6. **Reply brief (LLM, better model):** ideas, not text. Each item is a short note, never a sentence to paste:
   - **What they really need:** the underlying problem, in one line.
   - **Already said in the thread:** so you don't repeat other answers.
   - **Angles you could take:** 2–3 short notes (e.g. "compare cron vs queue tradeoffs", "warn about rate limits").
   - **From your experience:** points to relevant items in your founder context ("you hit this when migrating to Postgres").
   - **Questions to ask back:** when the post is too vague to answer well.
   - **Mention your product?** Yes/no, with the reason. It takes into account the community rules, your recent mentions there, and your account's maturity.
7. **You write:** in a plain editor next to the brief (or directly on the platform). Optional **"Check my reply"** flags problems as a list (breaks a rule, reads as promotional, product mention without disclosure, doesn't answer the question). It never rewrites your text.
8. **You post:** copy your reply, open the thread, paste it, then click "I replied". On HN, Greer finds your comment automatically by searching the thread for your username.
9. **Track:**
   - The worker watches your comments for replies and surfaces them in the inbox.
   - It also detects when a comment of yours was killed or removed (HN `dead`/`deleted` flags).
   - Each author you engaged with gets a lightweight "person" record: a timeline, not a CRM.

## Account-aware guardrails

Most bans come from behavior, not tools: too much self-promotion, a burst of replies from a new account, or breaking a community's rules. Greer knows your account and each community's requirements, so it can steer you away from all three.

**Your account profile** (`platform_account`)

- HN: age and karma are fetched from the official user API and refreshed daily.
- Reddit (v0.2): read from the API when credentials exist, otherwise entered by hand.
- **Maturity tier** (thresholds configurable per platform):
  - **New:** e.g. < 30 days or < 100 karma.
  - **Growing.**
  - **Established.**

**What changes with maturity**

|                             | New                                                                   | Growing                           | Established                          |
| --------------------------- | --------------------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| Product-mention suggestions | Off. Build trust first                                                | Rare, only when clearly asked for | Normal (still help-first, disclosed) |
| Pacing (defaults)           | Max ~3 replies/day, spread out, burst warning                         | ~5/day                            | ~10/day                              |
| Inbox focus                 | Threads where plain help fits; communities with no entry requirements | Mixed                             | Everything relevant                  |

The limits are warnings, not locks: you're the one posting, so Greer advises.

**Community requirements** (`community.requirements`)

- **What's stored:** minimum account age, minimum karma, required flair or verification, and other posting restrictions.
- **Where it comes from, with its source kept:**
  - _stated_: the LLM extracts it from the published rules text;
  - _user_: you enter or correct it;
  - _learned_: after a removal, Greer asks "was your comment removed? why?" and records the answer. Many subreddits hide their karma and age thresholds in AutoModerator, so this matters for Reddit.
- **In the inbox:** threads in communities you can't post in yet are hidden, or marked "You can't comment here yet (needs 100 karma)".
- **HN specifics:**
  - HN's guidelines and Show HN rules come bundled as the community rules.
  - New accounts appear with a green username and may be rate-limited.
  - Downvoting unlocks at 501 karma.

**Outcome signals**

- If your comments get killed or removed repeatedly (HN `dead` flag, or Reddit removals you report), Greer warns that the account may be flagged and pauses product-mention suggestions.
- The dashboard shows removal rate per community, so you can see where you're not landing well.

## Data access policy

Greer uses **official, permitted APIs only**.

| Platform               | Access                                                                                                                                                                                                                                                          | Notes                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Hacker News (v0.1)** | [Algolia HN Search API](https://hn.algolia.com/api) for keyword search across stories _and_ comments; [official Firebase API](https://github.com/HackerNews/API) for threads, user profiles (age, karma) and `dead`/`deleted` flags                             | Free, no key, generous limits. Verified working.                                              |
| **Reddit (v0.2)**      | The user's own approved API credentials under Reddit's [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy); Greer's docs include a template for requesting personal, non-commercial access | Approval is manual and [often denied](https://www.redditapis.com/blogs/reddit-data-api-2026). |
| **Reddit fallback**    | "Bring a thread": a bookmarklet sends the thread you're reading (from your own browser) to Greer for a brief and a reply check                                                                                                                                  | No server-side requests to Reddit. Reply tracking is manual in this mode.                     |

**What we tested (Sep 2026):**

- Reddit's `robots.txt` disallows all crawlers (`User-agent: * / Disallow: /`) and points to its Public Content Policy.
- Unauthenticated RSS requests were rate-limited (`429`) almost immediately.
- `.json` requests returned `403`, and a spoofed browser User-Agent was blocked outright.
- RSS polling is therefore not a viable default.

**Not allowed, even as an optional adapter:**

- **Scraping services and proxy networks** (Firecrawl, Apify, SerpApi, Oxylabs, residential proxies, …). They don't grant permission; they route around the platform's access controls.
  - Reddit is suing SerpApi, Oxylabs, AWMProxy and Perplexity over exactly this, [including claims of circumventing technical protections under the DMCA](https://searchengineland.com/reddit-sues-perplexity-serpapi-scraping-google-463681).
  - The legal and ToS risk would land on each self-hoster, and on the project's reputation.
- **Using the user's logged-in session or cookies** to fetch data. That would link automated traffic to the user's account, which is the ban risk Greer exists to avoid.
- The exception would be a data provider with an actual license from the platform. Evaluate case by case.

## Architecture

The target design. For how the code is built today, see [ARCHITECTURE.md](ARCHITECTURE.md).

```
┌─────────────── one Docker image ───────────────┐
│  web     (Next.js App Router: UI + API routes) │
│  worker  (node dist/worker.js: pg-boss jobs)   │
└────────────────────┬───────────────────────────┘
                     │
               Postgres 16 (+ pgvector, optional later)
```

- **Next.js 16 (App Router)** with server components and server actions.
- **Tailwind CSS v4** (CSS-first config via `@theme` in `globals.css`, no `tailwind.config`) + **shadcn/ui** components (added via CLI into `src/components/ui`). Semantic tokens only, so dark mode works from day one.
- **Postgres** is the only infrastructure dependency.
  - **pg-boss** handles the job queue and cron on Postgres, so there is no Redis: one less service on Coolify.
  - Jobs and data share transactions and backups.
  - Queue calls go through `src/worker/queue.ts`, so the queue can be swapped later if a hosted version ever needs it.
- **Drizzle ORM** with migrations that run automatically on container start.
- **Vercel AI SDK** for provider-agnostic LLM calls (OpenAI, Anthropic, OpenAI-compatible/Ollama). Set via env or the settings UI. Structured output (zod) for scoring.
- **Auth:** Better Auth, email + password. Users and workspaces are separate: each account gets its own workspace (a user may have several later, e.g. one per product). `workspace_id` on every table keeps workspaces isolated.
- **Same image, two commands:** `web` and `worker` services in `docker-compose.yml`. Coolify deploys the compose file directly.
- Monorepo is not needed yet. Use one package with `src/app`, `src/worker`, `src/sources/*` and `src/llm`.
- **Code quality:**
  - Prettier (+ `prettier-plugin-tailwindcss`) formats the code; ESLint lints it; TypeScript runs in strict mode.
  - simple-git-hooks + lint-staged format and lint staged files on commit.
  - A committed `.prettierrc` means contributors never debate formatting.

### Source adapter interface

```ts
interface Source {
  id: 'hn' | 'reddit' | ...;
  fetchNew(query: SourceQuery, since: Date): Promise<RawItem[]>;
  fetchThread(externalId: string): Promise<Thread>;
  fetchAccount?(handle: string): Promise<AccountProfile>;       // age, karma
  fetchRules?(community: string): Promise<CommunityRules>;
  findUserReply?(threadId: string, handle: string): Promise<RawItem | null>;
  itemStatus?(externalId: string): Promise<'live' | 'dead' | 'deleted'>;
  permalink(item: RawItem): string;
}
```

"Community" is generic: a subreddit on Reddit, a section (Ask HN, Show HN, all) on HN.

### Data model (first pass)

- `workspace`: product profile, ICP, LLM settings
- `founder_note`: short experience notes (story, lesson, stack, tags) referenced by briefs
- `platform_account`: platform, handle, created_at, karma, maturity tier, source (api/manual), refreshed_at
- `source_query`: platform, community, keywords, poll interval, enabled
- `community`: rules text, requirements (min age, min karma, flair, notes, each with a source: stated/user/learned), cooldown, promo stats, removal rate
- `item`: external_id, platform, community, author, title, body, url, created_at, raw json
- `item_score`: relevance, intent, reason, model, prompt_version
- `triage`: status (new / snoozed / dismissed / in_progress / replied), feedback
- `reply_brief`: need, angles, experience refs, questions, mention_ok + reason, prompt_version
- `reply`: the user's own text (autosaved), check results, mentions_product (bool)
- `engagement`: item, your comment ID/URL, replied_at, mentions_product, status (live / dead / removed), removal reason
- `person`: platform + handle, first seen, notes, linked engagements
- `notification`: new replies to your comments, removals, account warnings

## Testing strategy

Testing is in scope from Milestone 1. An open-source project lives or dies by whether contributors can change code without breaking self-hosters.

| Layer         | Tool                                                                            | Covers                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | Vitest                                                                          | Normalizers, prefilter and eligibility rules, maturity tiers, pacing/promo-ratio/cooldown math, prompt builders, zod schemas                                                                                                                        |
| Integration   | Vitest + real Postgres (Docker service in CI)                                   | Queries, server actions, job handlers (idempotency, retries), workspace isolation, migrations applying from scratch                                                                                                                                 |
| End-to-end    | Playwright against `docker compose`                                             | Onboarding → first inbox, keyboard triage + undo, brief → write → "I replied" → timeline, settings errors                                                                                                                                           |
| Accessibility | `@axe-core/playwright` in the E2E suite                                         | No serious/critical violations on every main screen                                                                                                                                                                                                 |
| LLM quality   | Eval set of ~50 labelled real posts per prompt                                  | Scoring precision/recall; briefs contain no paste-ready sentences and respect mention rules and account maturity; reply check catches missing disclosure and rule breaks; requirement extraction from rules text. Compared across `prompt_version`s |
| Self-host     | CI job: build image → compose up → health check → upgrade from the previous tag | The Coolify path never breaks                                                                                                                                                                                                                       |

- **Deterministic by default:** sources replay recorded fixtures; the LLM is a mock provider (`LLM_PROVIDER=mock`) in unit, integration and E2E tests. Real-model evals run manually or on a nightly job with a repo secret.
- **CI (GitHub Actions) on every PR:** `format:check` → `lint` → `typecheck` → unit → integration → E2E → Docker build. Self-host upgrade test runs on release tags.
- **Coverage:** no vanity percentage target. The rules are that every bug fix ships with a regression test, and every job/query ships with isolation and idempotency tests.

## UX principles

The product is a daily habit tool (a 10–15 min triage session), so UX is about speed, trust and calm.

1. **Inbox zero, fast.** A keyboard-first triage inbox (j/k, d, s, r, `?`). Actions update instantly (optimistic) and can be undone, and the next item gets focus automatically.
2. **Always explain why.** Every thread shows its relevance reason and matched keywords. Every brief shows the community rules it was checked against.
3. **Trust by design.** The primary action is "Copy & open thread", never "Reply", which makes clear Greer doesn't post. LLM cost estimates are visible in settings.
4. **Account health at a glance.** A small indicator shows maturity tier, today's replies vs pace and recent removals. It warns, it doesn't nag.
5. **Every state designed.** Loading uses skeletons. Empty states say what to do next. Errors say how to fix the problem. Partial failures (e.g. one source failing) don't blank the page.
6. **Onboarding to value in under 5 minutes.** Describe the product → link your HN username → get suggested keywords → the first scored threads appear while you watch. Anything else can be changed later in settings.
7. **Calm, not gamified.** No streaks or vanity metrics. The dashboard shows conversations started, replies received, and people who came back.
8. **Accessible and responsive.** WCAG 2.2 AA, both themes, fully usable at 375 px (the inbox and reply panels stack).
9. **Wireframes of the core screens: done** ([canvas](https://claude.ai/artifact/5aniCLzP13cp88xx4pKdyc), private). Decisions from the review:
   - onboarding stays short: product → accounts (optional) → keywords → first scan;
   - the inbox keeps 3 columns: views · ranked list · thread panel;
   - threads show both the score and the criteria behind it;
   - Show HN launches get their own tab ("Feedback · Show HN"); if it gets neglected, add a small "3 new launches" hint in the main inbox.

## Coolify / self-hosting

- `docker-compose.yml` with `web`, `worker` and `postgres`, plus a named volume.
- Required env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`. Optional: `ALLOW_REGISTRATION` (default `false`: registration closes once the first account exists; when `true`, each new account gets its own workspace), `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_BASE_URL`. v0.2 adds `REDDIT_CLIENT_ID/SECRET`.
- HN needs no credentials, so a fresh install works with just a database and an LLM key.
- `/api/health` for Coolify health checks.
- Publish the image to GHCR on tag, so users can pin versions.
- Docs: "Deploy on Coolify" (one-click via compose), plain Docker Compose, and a local dev guide.
- Later: submit a Coolify one-click service template.

## Working with Claude Code

- [`CLAUDE.md`](CLAUDE.md): the hard rules (never post, never write replies, official APIs only, Postgres only, `workspace_id` everywhere), design stance, stack, layout, commands and conventions.
- `.claude/skills/`: step-by-step guides for recurring work:
  - `add-source`: new platform adapters, official APIs only, read-only, fixture-tested
  - `db-change`: Drizzle schema changes that are safe to upgrade across versions
  - `llm-prompt`: versioned prompts, zod schemas, evals, prompt-injection hygiene
  - `ui-component`: Tailwind v4 + shadcn patterns, UX standards (states, feedback, undo, keyboard), WCAG 2.2 AA, done checklist
  - `write-tests`: which test layer to use, no-network/real-DB rules, required E2E flows, pre-finish checks
  - `selfhost-check`: clean Docker/Coolify install and upgrade test before releases

## People and progress (added Sep 2026)

Built ahead of Milestone 3, from principle 7:

- **Accounts:** a page listing every platform (HN connectable; Reddit and X shown as coming later), also an optional onboarding step.
- **Replies and answers:** Greer finds the user's own HN comments, watches the direct answers for 14 days and tags them (thanks, question, disagreement, neutral). The inbox shows "They answered you".
- **Your people:** a map of everyone the user talked with, the person panel (open questions first), a "they tried the product" mark, and the long-game path (talked with → answered → came back → tried).
- **Topics:** "What you help people with", named per reply and reused; each grows (planted → growing → rooted) only from what people do back.

- **Today** (the home screen, replacing the inbox). Designed on the canvas as "tagged feed + the person beside it":
  - **One feed of people**, each card tagged **Someone you know** or **Someone new**. Known people appear when they have news: an open question to you (until you answer it, up to 14 days), another answer in the last 3 days, a new help thread of theirs that Greer found, or a Show HN they posted. New people are the best-scored help threads by someone you haven't talked with yet.
  - **The pace caps new people only**: as many picks a day as the account's safe pace (3, 5 or 10 by maturity). "Show more" opens the rest with a gentle "past today's pace" note; it warns, never blocks. People you know are never capped.
  - Order: open questions first, then new and known people alternate.
  - **Beside the feed:** nothing picked shows your people as a slowly moving network (who has news today glows, today's new people wait at the edge). Picking someone shows their thread and, later, the reply brief (Milestone 3), or your history with them.
  - **Launches are people too:** a well-scored Show HN (the maker asks for feedback you can give) joins the feed as a new person, "launched something and asks for feedback", within the same pace. A "Meanwhile, people are building" strip was tried first and dropped: nice to look at, but nothing to act on.
  - **One card per person:** someone's best thread leads, their other threads come along ("+2 more threads"); the pace counts people. Only threads from the last 72 hours show (not 48, so a weekend away doesn't hide Friday's threads).
  - **After you reply to someone**, their threads and launches from before that leave Today (they were already in front of you), and the same post made twice counts as one thread. What they post afterwards is news again. The day's pace counts people, not replies.
  - **"I replied"** (or `r`) takes a card off, counts it in the day's progress at once and starts a reply check right away; Greer confirms it with the reply it finds, counted once. If a marked reply still isn't found 2 hours later (with a check run since), Today asks quietly: "It's there, look again" or "Forget it" (the mark stops counting), so the progress stays honest and nobody is silently lost.
  - "Not for me" hides a person's threads, with undo; **Hidden threads** lists them to bring one back. Snooze, tabs, keyword filters and the lower-matches toggle are gone. `/inbox` redirects to Today.
  - Deferred: watching known people's own new posts beyond what keyword searches find (one Algolia call per person), and a "seen" marker so news from people you know leaves once read.

Out of scope for now: **product mentions** (searching HN for the product's name). Mentions can take months to appear, and other features matter more first.

## Milestones

| #   | Milestone              | Outcome                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | **Spike (2–3 days)**   | Script: pull the last 30 days of HN stories + comments for your SaaS keywords (Algolia), score them with an LLM, print the top 20. Is it useful for _your_ product? Tune the keywords and scoring prompt. **Done.** Its code was removed after Milestone 2 (it's in git history); its threads live on as the scoring eval set. |
| 1   | **Skeleton**           | Next.js + Tailwind v4 + shadcn/ui + Drizzle + Better Auth + pg-boss, compose file, deploys on Coolify, health check. Prettier/ESLint/git hooks, Vitest + Playwright set up, mock LLM provider, CI pipeline green. Make the commands in `CLAUDE.md` real.                                                                       |
| 2   | **Ingest + inbox**     | Wireframes of the 3 core screens first. Onboarding (product profile, HN username, keywords), HN source adapter, prefilter, LLM scoring, keyboard-driven ranked inbox with undo. Recorded HN fixtures, first eval set for scoring, E2E for onboarding → inbox.                                                                  |
| 3   | **Brief + engage**     | Founder context notes, reply brief, editor with autosave, "Check my reply", rules panel (HN guidelines), copy + open-thread flow, "I replied" with auto-detection of your comment. Eval sets for briefs (no paste-ready text) and reply check, E2E for brief → write → replied.                                                |
| 4   | **Track + guardrails** | Reply tracking, dead/deleted detection, person timeline, account profile + maturity tiers, pacing/promo/cooldown warnings, account-health indicator, daily email/webhook digest. Integration tests for tracking jobs and guardrail math.                                                                                       |
| 5   | **Public v0.1 (HN)**   | UX polish pass (all states, a11y audit, mobile), self-host upgrade test in CI, README, Coolify guide, demo GIF, GHCR images, CONTRIBUTING.md (contributions licensed under AGPL-3.0). Launch as a Show HN (dogfood the tool for its own launch) and on r/selfhosted.                                                           |
| 6   | **v0.2 (Reddit)**      | Reddit adapter with the user's approved API credentials + access-request template, "bring a thread" bookmarklet, community requirements (stated/user/learned), removal reporting, feedback-tuned scoring.                                                                                                                      |
| 7   | **Later**              | More official-API sources based on demand (Bluesky, GitHub Discussions, Lobsters, Stack Exchange), pgvector semantic matching.                                                                                                                                                                                                 |

## Open questions

1. **Hosted version later?** This affects whether to invest in multi-tenancy now. Current plan: `workspace_id` everywhere, one workspace per user in the UI, users and workspaces already separate.
2. **Notifications:** email digest (needs SMTP config) vs webhook (Slack/Discord) vs in-app only for v0.1?
3. **Name / positioning:** "greer" is the repo name. Is that the product name?
4. **Maturity thresholds:** the defaults above are guesses. Calibrate them during dogfooding.
5. **Jev for scoring: decided (Sep 2026).** TypeSafe's Jev (typed yes/no, choice and score answers with probabilities, no text) is the preferred scorer when a TypeSafe key is set; the LLM provider is the fallback and still does keyword suggestions, answer tones, topics and briefs. On 56 labeled threads (`pnpm eval jev`) it matched Haiku's precision and recall, ranked slightly better (0.81 vs 0.75), and was about 6× faster and 30× cheaper (about $0.04 per 1,000 threads), with near-identical answers run to run. It writes no reason line, so "why you" is the criteria checklist. Weak spot: judging whether a maker is in the user's audience (answers near 0.5); tune it later against real "Not for me" / "I replied" labels rather than hand labels. Settings present AI as two jobs, each with its own provider and model: **sorting threads** (Jev, Claude Haiku, OpenAI or Ollama; fast and cheap) and **writing help** (keyword suggestions, answer tones, topics, reply ideas; a mid-size LLM, Claude Sonnet 5 by default). Keys are stored once per provider, so one Claude key can do both.
