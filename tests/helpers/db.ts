import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://greer:greer@localhost:5432/greer_test";

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://greer:greer@localhost:5432/greer_e2e";

// Drops and recreates the database in `url`, then applies all migrations.
// Refuses anything that doesn't look like a test database.
export async function resetDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(`Refusing to reset "${name}": not a test database.`);
  }

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const adminClient = new Client({ connectionString: admin.toString() });
  await adminClient.connect();
  try {
    await adminClient.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await adminClient.query(`CREATE DATABASE "${name}"`);
  } finally {
    await adminClient.end();
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder: "src/db/migrations",
    });
  } finally {
    await client.end();
  }
}
