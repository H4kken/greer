CREATE TYPE "public"."ai_provider" AS ENUM('typesafe', 'anthropic', 'openai', 'ollama');--> statement-breakpoint
CREATE TABLE "ai_key" (
	"workspace_id" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"api_key_encrypted" text,
	"base_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_key_workspace_id_provider_pk" PRIMARY KEY("workspace_id","provider")
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"sorting_provider" "ai_provider",
	"sorting_model" text,
	"writing_provider" "ai_provider",
	"writing_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_key" ADD CONSTRAINT "ai_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Carry saved settings over: keys once per provider, then each job's choice.
-- A saved TypeSafe key meant "Jev sorts"; the old LLM did everything else.
INSERT INTO "ai_key" ("workspace_id", "provider", "api_key_encrypted", "base_url")
SELECT "workspace_id", "provider"::text::"ai_provider", "api_key_encrypted", "base_url" FROM "llm_settings";--> statement-breakpoint
INSERT INTO "ai_key" ("workspace_id", "provider", "api_key_encrypted")
SELECT "workspace_id", 'typesafe', "api_key_encrypted" FROM "jev_settings";--> statement-breakpoint
INSERT INTO "ai_settings" ("workspace_id", "sorting_provider", "sorting_model", "writing_provider", "writing_model")
SELECT w."id",
  CASE WHEN j."workspace_id" IS NOT NULL THEN 'typesafe'::"ai_provider" ELSE l."provider"::text::"ai_provider" END,
  CASE WHEN j."workspace_id" IS NOT NULL THEN NULL ELSE l."fast_model" END,
  l."provider"::text::"ai_provider",
  l."quality_model"
FROM "workspace" w
LEFT JOIN "llm_settings" l ON l."workspace_id" = w."id"
LEFT JOIN "jev_settings" j ON j."workspace_id" = w."id"
WHERE l."workspace_id" IS NOT NULL OR j."workspace_id" IS NOT NULL;
