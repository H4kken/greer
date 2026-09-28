CREATE TYPE "public"."answer_tone" AS ENUM('question', 'thanks', 'disagreement', 'neutral');--> statement-breakpoint
CREATE TABLE "reply_answer" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"reply_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text NOT NULL,
	"author" text NOT NULL,
	"text" text NOT NULL,
	"url" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"tone" "answer_tone",
	"thanked" boolean,
	"asked" boolean,
	"disagreed" boolean,
	"tone_reason" text,
	"prompt_version" text,
	"model" text,
	"classified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reply" ADD COLUMN "answers_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reply_answer" ADD CONSTRAINT "reply_answer_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_answer" ADD CONSTRAINT "reply_answer_reply_id_reply_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."reply"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reply_answer_workspace_platform_external_idx" ON "reply_answer" USING btree ("workspace_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "reply_answer_workspace_posted_idx" ON "reply_answer" USING btree ("workspace_id","posted_at");--> statement-breakpoint
CREATE INDEX "reply_answer_reply_idx" ON "reply_answer" USING btree ("reply_id");