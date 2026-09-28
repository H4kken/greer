CREATE TABLE "topic" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reply" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "topic" ADD CONSTRAINT "topic_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_workspace_name_idx" ON "topic" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
ALTER TABLE "reply" ADD CONSTRAINT "reply_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE set null ON UPDATE no action;