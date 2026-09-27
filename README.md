# Greer

**Find the conversations where you can genuinely help. Write the replies yourself.**

Greer is an open-source, self-hostable tool for small SaaS builders who want to grow a community from zero: find people who have the problem you solve, join their conversations with useful answers, and remember who you talked to.

> **Status: early, planning stage.** There's nothing to install yet. This README explains what Greer is for; [PLAN.md](PLAN.md) has the detailed v1 plan. Feedback on the idea is very welcome.

---

## Why this exists

If you're building a small SaaS, your first users rarely come from ads. They come from conversations: someone on Reddit asking how to solve exactly the problem you've been working on for months, and you showing up with a helpful answer.

The problem is finding those conversations. It means hours of scrolling subreddits, running the same searches again and again, forgetting threads you meant to answer, and losing track of the people you've already helped.

The tools that promise to fix this mostly make it worse. They generate AI replies, post automatically, and slip product links into every thread. Communities notice, accounts get banned, and "reply to Reddit posts" turns into spam.

Greer takes the opposite approach. **It does the tedious part (finding, filtering, remembering) and leaves the human part to you.**

## What Greer does

- **Watches the communities you care about.** It follows the keywords and communities where your future users talk about their problems. Hacker News comes first; Reddit follows.
- **Surfaces the threads worth your time.** An LLM scores each post for relevance and tells you _why_ it was surfaced, so you're not reading hundreds of posts.
- **Gives you a fast daily inbox.** Triage in 10–15 minutes, keyboard-first: open, snooze or dismiss.
- **Helps you think, not write.** For each thread, a short _reply brief_:
  - what the person really needs;
  - what the thread already covers;
  - a few angles you could take;
  - which of your own experiences are relevant;
  - whether mentioning your product would be appropriate there.

  The brief is ideas, never text to paste.

- **Checks your reply if you ask.** It flags a broken community rule, a promotional tone or a missing "I built this" disclosure. It never rewrites what you wrote.
- **Knows your account.** A two-week-old account and a five-year-old one with 10k karma aren't the same. Greer adapts how often it suggests you reply, whether mentioning your product is wise, and which communities you can actually post in (minimum karma, account age), so you don't get flagged or banned.
- **Remembers the relationships.** It tracks who replied to you and keeps a simple timeline of every person you've talked with, so conversations turn into relationships.

## What Greer will never do

- **Post, comment, vote or DM for you.** You always post yourself, on the platform. This keeps your account safe and your presence real.
- **Write your replies.** Genuine words from a real founder beat polished AI text, and communities can tell the difference.
- **Scrape, or get around platform limits.** Greer uses official APIs only. No scraping services, no proxies, no using your logged-in session.
- **Turn people into a funnel.** No growth-hacking metrics, streaks or vanity dashboards. It measures conversations started and people who come back.

## Principles

1. **Your words, not AI slop.** The LLM suggests ideas; you write.
2. **Help first, pitch rarely.** Answer the question. Mention your product only when it really helps, and always say you built it.
3. **Respect each community, and your account.** Community rules are shown while you write. Greer paces you according to your account's age and karma, tracks how often you mention your product, and warns you before you overdo it.
4. **Your data, your keys.** Self-hosted, with your own LLM key (OpenAI, Anthropic, or a local model via Ollama).
5. **Simple first.** A tool that works for one founder today, designed so it can grow later.

## How it will work

```
Pick keywords & communities → Greer finds and scores threads → you triage your inbox
→ read the brief → write your own reply → post it on Reddit → Greer tracks the conversation
```

You start by describing your product, who it's for and the problems it solves. You also add a few notes about your own experience: what you've built, what broke, what you learned. Greer suggests communities to watch, and after that it's a short daily habit.

## Self-hosting

Greer is being built to be easy to run yourself, especially on [Coolify](https://coolify.io):

- one Docker image (web app + background worker);
- **no platform credentials needed for Hacker News**;
- **Postgres as the only dependency**: no Redis or extra services, so it fits on a small VPS;
- a Docker Compose file you can deploy on Coolify in one step;
- bring your own LLM API key, or point it at a local Ollama.

> Greer doesn't do anything useful yet (there's no source or inbox logic). These instructions describe how the stack runs today.

### With Docker Compose

```bash
git clone https://github.com/H4kken/greer.git && cd greer
cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=http://localhost:3000
ENV
docker compose up -d --build
```

Open `http://localhost:3000` and create the owner account. Database migrations run automatically when the web container starts.

### With Coolify

Create a new resource from this Git repository using the **Docker Compose** build pack (`docker-compose.yml`). Set the variables below in Coolify, assign your domain to the `web` service (port 3000), and deploy.

### Environment variables

| Variable                              | Required       | Description                                                                                                     |
| ------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                   | yes            | Password of the bundled Postgres. Use a URL-safe value, e.g. `openssl rand -hex 24`.                            |
| `BETTER_AUTH_SECRET`                  | yes            | Secret that signs sessions, e.g. `openssl rand -base64 32`.                                                     |
| `BETTER_AUTH_URL`                     | yes            | Public URL of your instance, e.g. `https://greer.example.com`.                                                  |
| `ALLOW_REGISTRATION`                  | no             | `false` by default: the first account becomes the owner, then sign-ups close. Set to `true` to let others join. |
| `PORT`                                | no             | Host port for the web app (default `3000`).                                                                     |
| `ANTHROPIC_API_KEY`                   | one LLM option | Anthropic key. Default models: `claude-haiku-4-5` (scoring) and `claude-opus-5` (briefs).                       |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`   | one LLM option | OpenAI or any OpenAI-compatible API. Also set `LLM_FAST_MODEL` and `LLM_QUALITY_MODEL`.                         |
| `OLLAMA_BASE_URL`                     | one LLM option | A local Ollama, e.g. `http://host.docker.internal:11434/v1`. Also set both model variables.                     |
| `LLM_FAST_MODEL`, `LLM_QUALITY_MODEL` | no             | Override the model used for scoring (fast) and for briefs (quality).                                            |

Instead of LLM variables, you can save a key in Settings: it's stored encrypted with `BETTER_AUTH_SECRET` and takes precedence. If you change `BETTER_AUTH_SECRET`, re-enter the key.

`GET /api/health` reports the database and the background worker; the web container's health check uses it.

### Why Hacker News first, and what about Reddit?

Hacker News has free, official APIs, so Greer works there out of the box.

Reddit is harder:

- Since late 2025, new API credentials need manual approval.
- Reddit blocks automated access without an agreement, and it is suing scraping services over it.

Greer won't work around that. For Reddit (v0.2), you'll use your own approved API credentials, and Greer's docs will help you request them. Without credentials, a "bring a thread" bookmarklet sends the thread you're reading to Greer for a brief and a reply check.

## Roadmap

| Stage     | Goal                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spike** | Confirm that finding and scoring HN threads is useful, by dogfooding it on a real SaaS                                                                    |
| **v0.1**  | Hacker News monitoring, scored inbox, reply briefs, reply check, conversation tracking, account-aware guardrails, one-step Coolify deploy                 |
| **v0.2**  | Reddit with your own API credentials, a "bring a thread" bookmarklet, per-community requirements (karma, account age), smarter scoring from your feedback |
| **Later** | More official-API sources (Bluesky, GitHub Discussions, Lobsters, Stack Exchange…), based on what users ask for                                           |

## Tech stack

Next.js · TypeScript · Tailwind CSS v4 · shadcn/ui · Postgres · Drizzle · pg-boss · Vercel AI SDK · Vitest · Playwright

## Contributing

It's early, which is the best time to shape the project. The most useful things right now:

- **Tell us how you find users today.** Which communities, and what's painful about it.
- **Challenge the principles.** If something here seems wrong, open an issue.
- **Follow the plan.** [PLAN.md](PLAN.md) has the architecture and milestones, and [CLAUDE.md](CLAUDE.md) has the coding conventions (also used by AI coding assistants).

Contribution guidelines and setup instructions will come with the first code. By contributing, you agree that your contributions are licensed under the AGPL-3.0, like the rest of the project.

## License

Greer is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

In plain terms:

- You can use, modify and self-host Greer for free, for any purpose, including commercial use.
- If you run a **modified** version as a service for other people, you must publish your changes under the same license.
- Self-hosting it for yourself or your team, as-is or modified, creates no extra obligations.

This keeps Greer and its improvements open, and it stops closed-source hosted clones built on the community's work.

Copyright © 2026 Mathis Grimberg.
