# One image for both processes:
#   web (default): runs migrations, then the Next.js server
#   worker:        docker run … node dist/worker.mjs

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Install dependencies (cached unless the lockfile changes).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --filter greer

# Build the web app (standalone output) and bundle the worker + migrations.
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && pnpm build:worker

# Runtime: only what's needed to run, as a non-root user.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations
RUN addgroup -S greer && adduser -S greer -G greer

COPY --from=build --chown=greer:greer /app/.next/standalone ./
COPY --from=build --chown=greer:greer /app/.next/static ./.next/static
COPY --from=build --chown=greer:greer /app/dist ./dist
COPY --from=build --chown=greer:greer /app/src/db/migrations ./migrations

USER greer
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["sh", "-c", "node dist/migrate.mjs && exec node server.js"]
