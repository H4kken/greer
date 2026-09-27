import { defineConfig, devices } from "@playwright/test";

// Not 3000, so tests don't collide with a dev server that's already running.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://greer:greer@localhost:5432/greer_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Fresh database, then the production build, like self-hosters run it.
    // (Playwright starts the web server before any globalSetup, so the reset lives here.)
    command: `node tests/e2e/reset-db.ts && pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_SECRET: "e2e-secret-not-for-production-0123456789",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      ALLOW_REGISTRATION: "false",
    },
  },
});
