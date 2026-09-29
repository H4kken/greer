ALTER TABLE "item" ADD COLUMN "comment_count" integer;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "replies_to_item" integer;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "author_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "activity_checked_at" timestamp with time zone;