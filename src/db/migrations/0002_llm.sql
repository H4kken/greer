CREATE TYPE "public"."llm_provider" AS ENUM('anthropic', 'openai', 'ollama');--> statement-breakpoint
CREATE TABLE "llm_call" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"slot" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_name" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"fast_model" text,
	"quality_model" text,
	"base_url" text,
	"api_key_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_settings" ADD CONSTRAINT "llm_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_call_workspace_created_idx" ON "llm_call" USING btree ("workspace_id","created_at");