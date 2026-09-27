import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Single workspace in the UI for now; every workspace-owned table references it
// so a hosted, multi-workspace version stays possible.
export const workspace = pgTable("workspace", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  ...timestamps,
});

export const workspaceRole = pgEnum("workspace_role", ["owner", "member"]);

export const workspaceMember = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_member_user_id_idx").on(t.userId),
  ],
);

// Liveness of background processes, written by the heartbeat job.
// One row per process kind (currently just "worker").
export const workerStatus = pgTable("worker_status", {
  id: text("id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});

export const llmProvider = pgEnum("llm_provider", [
  "anthropic",
  "openai",
  "ollama",
]);

// LLM configuration saved from Settings. When absent, Greer falls back to
// environment variables (see src/llm/config.ts).
export const llmSettings = pgTable("llm_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  provider: llmProvider("provider").notNull(),
  fastModel: text("fast_model"),
  qualityModel: text("quality_model"),
  baseUrl: text("base_url"),
  // Encrypted with src/lib/crypto.ts, never stored in plain text.
  apiKeyEncrypted: text("api_key_encrypted"),
  ...timestamps,
});

// One row per model call: powers cost display and debugging.
export const llmCall = pgTable(
  "llm_call",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptName: text("prompt_name").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms").notNull(),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("llm_call_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);
