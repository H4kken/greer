# Milestone 0 spike

A throwaway script that answers one question before any app gets built: **does finding and scoring Hacker News threads surface conversations worth replying to?** Greer dogfoods itself; the target users are SaaS builders who struggle with outreach, first customers, MVPs and launches.

```
HN Algolia search (14 queries) → dedupe + prefilter → fair cap → score (Claude Haiku 4.5)
→ top N → reply briefs for the top 3 (Claude Opus 5) → out/<timestamp>/report.md
```

## Run

```bash
cd spike
pnpm install
cp .env.example .env        # add your ANTHROPIC_API_KEY
pnpm dry                    # fetch + prefilter only, no LLM calls, free
pnpm start                  # full run, roughly $1–2
pnpm start --max 100 --briefs 0   # cheaper first try
```

Options: `--days 30`, `--per-query 100`, `--max 300` (items scored), `--top 20`, `--briefs 3`, `--concurrency 5`.

## Review

Open `out/<timestamp>/report.md` and tick "I would reply to this" for each top thread. Then decide:

- **Most of the top 20 are genuinely worth a reply:** the core idea works, move on to Milestone 1.
- **Lots of noise:** check the per-query stats in the report, drop or reword noisy queries in `src/config.ts`, and tune the rubric in `src/score.ts` (bump `PROMPT_VERSION`).
- **Briefs:** do they help you write faster without writing for you? Any "paste-ready" warnings?

Edit queries and the product description in [src/config.ts](src/config.ts).
