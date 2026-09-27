---
name: selfhost-check
description: Verify Greer still self-hosts cleanly (Docker image, docker-compose, Coolify). Use after changing the Dockerfile, compose file, env vars, startup/migrations, or before a release.
---

# Self-hosting check

1. `docker compose down -v && docker compose up --build -d` from a clean state (fresh volume).
2. Confirm that:
   - migrations ran on startup (web logs);
   - `curl -f localhost:3000/api/health` returns 200 and reports the DB and worker as healthy;
   - the worker picked up its cron schedules (worker logs);
   - sign-up → onboarding → first ingest works with only the required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) plus one LLM key.
3. Upgrade path: check out the previous release tag, bring it up, create data, switch back to this branch and `up --build`. Data must survive and migrations must apply.
4. Every env var used in code appears in `.env.example`, `docker-compose.yml` and the README table. The same image serves both `web` and `worker`; only the command differs.
5. Image stays reasonable: Next.js `output: "standalone"`, multi-stage build, non-root user. Report the image size.
6. Coolify: the compose file must not rely on host bind mounts or `build:` contexts outside the repo, and it must declare the healthcheck.
