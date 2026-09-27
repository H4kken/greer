import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run against a real Postgres (see docker-compose.yml).
// Files run one at a time because they share the test database.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://greer:greer@localhost:5432/greer_test";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    environment: "node",
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "test-secret-not-for-production-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      ALLOW_REGISTRATION: "false",
    },
  },
});
