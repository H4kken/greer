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
import { sql } from "drizzle-orm";
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

// One product being promoted. Users and workspaces are separate: membership
// lives in workspace_member, and every workspace-owned table references this.
// Each new account gets its own workspace today.
export const workspace = pgTable("workspace", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  // Product profile, filled in during onboarding. Scoring needs it.
  productName: text("product_name"),
  productDescription: text("product_description"),
  audience: text("audience"),
  problems: text("problems").array().notNull().default([]),
  // Set when the first scan starts; until then the app sends people to onboarding.
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
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

// ---- AI settings (src/llm/config.ts) ----
// Greer uses AI for two jobs: sorting threads (every thread, fast and cheap)
// and writing help (keywords, reading answers, reply ideas). Each job picks a
// provider and model; keys are stored once per provider, so one Claude key
// can serve both. Anything not saved here falls back to environment variables.

export const aiProvider = pgEnum("ai_provider", [
  "typesafe",
  "anthropic",
  "openai",
  "ollama",
]);

export const aiKey = pgTable(
  "ai_key",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    // Encrypted with src/lib/crypto.ts, never stored in plain text.
    apiKeyEncrypted: text("api_key_encrypted"),
    baseUrl: text("base_url"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.provider] })],
);

export const aiSettings = pgTable("ai_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  sortingProvider: aiProvider("sorting_provider"),
  sortingModel: text("sorting_model"), // null: the provider's default
  writingProvider: aiProvider("writing_provider"),
  writingModel: text("writing_model"),
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
    // Last successful look for the user's replies (src/replies/poll.ts).
    repliesCheckedAt: timestamp("replies_checked_at", { withTimezone: true }),
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

// Where an item stands in the user's triage. Snoozed items come back once
// snoozed_until has passed.
export const triageStatus = pgEnum("triage_status", [
  "new",
  "snoozed",
  "dismissed",
  // The user said they replied ("I replied"), before Greer found the reply.
  "replied",
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
    triageStatus: triageStatus("triage_status").notNull().default("new"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    // Optional "not relevant because…" from the user, to tune scoring later.
    dismissReason: text("dismiss_reason"),
    // How the conversation is going, checked while the item could show on
    // Today (src/today/activity.ts): comments in the thread, direct replies
    // to this item, and when its author last wrote there. Null until checked.
    commentCount: integer("comment_count"),
    repliesToItem: integer("replies_to_item"),
    authorActiveAt: timestamp("author_active_at", { withTimezone: true }),
    activityCheckedAt: timestamp("activity_checked_at", { withTimezone: true }),
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
    index("item_workspace_triage_idx").on(t.workspaceId, t.triageStatus),
  ],
);

// The latest score of an item. Criteria are the model's answers; the score is
// computed from them in code (src/scoring/compute.ts).
export const itemScore = pgTable(
  "item_score",
  {
    itemId: text("item_id")
      .primaryKey()
      .references(() => item.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    criteriaMet: integer("criteria_met").notNull(),
    criteriaTotal: integer("criteria_total").notNull(),
    criteria: jsonb("criteria").notNull(),
    intent: text("intent").notNull(),
    reason: text("reason").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    scoredAt: timestamp("scored_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("item_score_workspace_score_idx").on(t.workspaceId, t.score)],
);

// What the user helps people with ("Pricing", "First users"), named by the
// model from their replies and reused across them (src/replies/topics.ts).
export const topic = pgTable(
  "topic",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("topic_workspace_name_idx").on(
      t.workspaceId,
      sql`lower(${t.name})`,
    ),
  ],
);

// A comment the user wrote on a platform, found from their public profile.
// The start of everything Greer shows about people: who answered, who came
// back. item_id links it to the thread or comment Greer already knew, if any.
export const reply = pgTable(
  "reply",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    externalId: text("external_id").notNull(),
    parentExternalId: text("parent_external_id").notNull(),
    // Who the user replied to. Null until looked up; "" when unknown
    // (deleted), so it isn't looked up again.
    parentAuthor: text("parent_author"),
    threadExternalId: text("thread_external_id").notNull(),
    threadTitle: text("thread_title").notNull(),
    itemId: text("item_id").references(() => item.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    url: text("url").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    raw: jsonb("raw").notNull(),
    // Last look for answers to it (src/replies/answers.ts).
    answersCheckedAt: timestamp("answers_checked_at", { withTimezone: true }),
    // Null until the model has named it.
    topicId: text("topic_id").references(() => topic.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reply_workspace_platform_external_idx").on(
      t.workspaceId,
      t.platform,
      t.externalId,
    ),
    index("reply_workspace_posted_idx").on(t.workspaceId, t.postedAt),
    index("reply_item_idx").on(t.itemId),
  ],
);

// How someone answered the user, from the model's yes/no signals
// (src/replies/classify.ts). A question wins: it's a conversation to continue.
export const answerTone = pgEnum("answer_tone", [
  "question",
  "thanks",
  "disagreement",
  "neutral",
]);

// A direct answer to one of the user's replies, by someone else.
export const replyAnswer = pgTable(
  "reply_answer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    replyId: text("reply_id")
      .notNull()
      .references(() => reply.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    externalId: text("external_id").notNull(),
    author: text("author").notNull(),
    text: text("text").notNull(),
    url: text("url").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    // Null until the model has read it.
    tone: answerTone("tone"),
    thanked: boolean("thanked"),
    asked: boolean("asked"),
    disagreed: boolean("disagreed"),
    toneReason: text("tone_reason"),
    promptVersion: text("prompt_version"),
    model: text("model"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reply_answer_workspace_platform_external_idx").on(
      t.workspaceId,
      t.platform,
      t.externalId,
    ),
    index("reply_answer_workspace_posted_idx").on(t.workspaceId, t.postedAt),
    index("reply_answer_reply_idx").on(t.replyId),
  ],
);

// What only the user knows about someone they talked with: for now, whether
// that person tried their product. People themselves are derived from
// replies and answers (src/people), not stored.
// News from someone the user knows (an answer, a launch) that the user has
// read on Today: it isn't news anymore. `subject` names it, e.g.
// "answer:<external id>" or "item:<item id>". Questions to the user stay
// until answered, seen or not.
export const seenNews = pgTable(
  "seen_news",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    subject: text("subject").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.platform, t.subject] })],
);

export const personMark = pgTable(
  "person_mark",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    platform: platform("platform").notNull(),
    handle: text("handle").notNull(),
    triedProductAt: timestamp("tried_product_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.platform, t.handle] })],
);
