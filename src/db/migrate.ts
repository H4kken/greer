// Applies pending migrations. Runs on container start before the web server
// (see Dockerfile); safe to run repeatedly.
import "../worker/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = new Client({ connectionString: url });
await client.connect();
try {
  await migrate(drizzle({ client }), {
    migrationsFolder: process.env.MIGRATIONS_DIR ?? "src/db/migrations",
  });
  console.log("[migrate] database is up to date");
} finally {
  await client.end();
}
