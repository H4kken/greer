CREATE TABLE "person_mark" (
	"workspace_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"handle" text NOT NULL,
	"tried_product_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_mark_workspace_id_platform_handle_pk" PRIMARY KEY("workspace_id","platform","handle")
);
--> statement-breakpoint
ALTER TABLE "reply" ADD COLUMN "parent_author" text;--> statement-breakpoint
ALTER TABLE "person_mark" ADD CONSTRAINT "person_mark_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;