---
name: selfhost-check
description: Verify Greer still self-hosts cleanly (Docker image, docker-compose, Coolify). Use after changing the Dockerfile, compose file, env vars, startup/migrations, or before a release.
---

# Self-hosting check

1. Start from a clean state under a separate project name so it can't touch the dev database, with generated secrets in a scratch env file:
   ```bash
   printf "POSTGRES_PASSWORD=%s\nBETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://localhost:3200\nPORT=3200\n" "$(openssl rand -hex 24)" "$(openssl rand -base64 32)" > /tmp/selfhost.env
   docker compose -p greer-selfhost --env-file /tmp/selfhost.env down -v
   docker compose -p greer-selfhost --env-file /tmp/selfhost.env up -d --build --wait
   ```
2. Confirm that:
   - the web logs show `[migrate] database is up to date` before the server starts;
   - `curl -f localhost:3200/api/health` returns 200 with `"status":"ok"` (database and worker);
   - the worker logs show `[worker] started`;
   - sign-up works with only the required env vars (`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), later plus one LLM key;
   - Postgres has no published port (`docker compose ps`).
     Clean up with `down -v` afterwards. CI's `self-host` job runs a subset of this on every push.
3. Upgrade path: check out the previous release tag, bring it up, create data, switch back to this branch and `up --build`. Data must survive and migrations must apply.
4. Every env var used in code appears in `.env.example`, `docker-compose.yml` and the README table. The same image serves both `web` and `worker`; only the command differs.
5. Image stays reasonable: Next.js `output: "standalone"`, multi-stage build, non-root user. Report the image size.
6. Coolify: the compose file must not rely on host bind mounts or `build:` contexts outside the repo, and it must declare the healthcheck.
