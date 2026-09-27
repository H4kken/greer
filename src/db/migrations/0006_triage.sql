CREATE TYPE "public"."triage_status" AS ENUM('new', 'snoozed', 'dismissed');--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "triage_status" "triage_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "triaged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "dismiss_reason" text;--> statement-breakpoint
CREATE INDEX "item_workspace_triage_idx" ON "item" USING btree ("workspace_id","triage_status");