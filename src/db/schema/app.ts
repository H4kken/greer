import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

export const platform = pgEnum("platform", ["hn"]);

// A saved search: one keyword query in one section of a platform.
export const sourceQuery = pgTable(
  "source_query",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    label: text("label").notNull(),
    query: text("query").notNull(),
    section: text("section").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("source_query_workspace_idx").on(t.workspaceId)],
);

// The user's own account on a platform: used to skip their own posts and,
// later, for account-aware guardrails (age, karma).
export const platformAccount = pgTable(
  "platform_account",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    handle: text("handle").notNull(),
    accountCreatedAt: timestamp("account_created_at", { withTimezone: true }),
    karma: integer("karma"),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.platform] })],
);

export const itemType = pgEnum("item_type", ["story", "comment"]);

// "help": someone with a problem. "feedback": a launch (e.g. Show HN).
export const itemCategory = pgEnum("item_category", ["help", "feedback"]);

// Result of the cheap, deterministic filter that runs before any LLM call.
export const filterStatus = pgEnum("filter_status", [
  "kept",
  "too_short",
  "hiring_thread",
  "dead",
  "own_post",
]);

// A post or comment fetched from a platform, once per workspace.
export const item = pgTable(
  "item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    externalId: text("external_id").notNull(),
    type: itemType("type").notNull(),
    author: text("author").notNull(),
    title: text("title").notNull(),
    text: text("text").notNull(),
    url: text("url").notNull(),
    threadId: text("thread_id").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    category: itemCategory("category").notNull(),
    filterStatus: filterStatus("filter_status").notNull(),
    // source_query ids that found this item
    matchedQueryIds: text("matched_query_ids").array().notNull(),
    raw: jsonb("raw").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("item_workspace_platform_external_idx").on(
      t.workspaceId,
      t.platform,
      t.externalId,
    ),
    index("item_workspace_status_posted_idx").on(
      t.workspaceId,
      t.filterStatus,
      t.postedAt,
    ),
  ],
);
