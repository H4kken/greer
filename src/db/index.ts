import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One pool per process. In development, reuse it across hot reloads.
const globalForDb = globalThis as unknown as { greerPool?: Pool };

const pool =
  globalForDb.greerPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== "production") globalForDb.greerPool = pool;

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
