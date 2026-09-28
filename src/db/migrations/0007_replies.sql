CREATE TABLE "reply" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"parent_external_id" text NOT NULL,
	"thread_external_id" text NOT NULL,
	"thread_title" text NOT NULL,
	"item_id" text,
	"text" text NOT NULL,
	"url" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_account" ADD COLUMN "replies_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reply" ADD CONSTRAINT "reply_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply" ADD CONSTRAINT "reply_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reply_workspace_platform_external_idx" ON "reply" USING btree ("workspace_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "reply_workspace_posted_idx" ON "reply" USING btree ("workspace_id","posted_at");--> statement-breakpoint
CREATE INDEX "reply_item_idx" ON "reply" USING btree ("item_id");