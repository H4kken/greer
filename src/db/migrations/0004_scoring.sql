CREATE TABLE "item_score" (
	"item_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"score" integer NOT NULL,
	"criteria_met" integer NOT NULL,
	"criteria_total" integer NOT NULL,
	"criteria" jsonb NOT NULL,
	"intent" text NOT NULL,
	"reason" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "product_name" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "product_description" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "audience" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "problems" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_score" ADD CONSTRAINT "item_score_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_score" ADD CONSTRAINT "item_score_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_score_workspace_score_idx" ON "item_score" USING btree ("workspace_id","score");