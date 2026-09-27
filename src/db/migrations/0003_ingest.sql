CREATE TYPE "public"."filter_status" AS ENUM('kept', 'too_short', 'hiring_thread', 'dead', 'own_post');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('help', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('story', 'comment');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('hn');--> statement-breakpoint
CREATE TABLE "item" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"type" "item_type" NOT NULL,
	"author" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"url" text NOT NULL,
	"thread_id" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"category" "item_category" NOT NULL,
	"filter_status" "filter_status" NOT NULL,
	"matched_query_ids" text[] NOT NULL,
	"raw" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_account" (
	"workspace_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"handle" text NOT NULL,
	"account_created_at" timestamp with time zone,
	"karma" integer,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_account_workspace_id_platform_pk" PRIMARY KEY("workspace_id","platform")
);
--> statement-breakpoint
CREATE TABLE "source_query" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"label" text NOT NULL,
	"query" text NOT NULL,
	"section" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_account" ADD CONSTRAINT "platform_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_query" ADD CONSTRAINT "source_query_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_workspace_platform_external_idx" ON "item" USING btree ("workspace_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "item_workspace_status_posted_idx" ON "item" USING btree ("workspace_id","filter_status","posted_at");--> statement-breakpoint
CREATE INDEX "source_query_workspace_idx" ON "source_query" USING btree ("workspace_id");