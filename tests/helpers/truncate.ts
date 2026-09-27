import { sql } from "drizzle-orm";
import { db } from "@/db";

// Empties every app table between tests. Keep in sync with the schema.
export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`TRUNCATE "user", "session", "account", "verification", "workspace", "workspace_member" CASCADE`,
  );
}
