CREATE TABLE "seen_news" (
	"workspace_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"subject" text NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seen_news_workspace_id_platform_subject_pk" PRIMARY KEY("workspace_id","platform","subject")
);
--> statement-breakpoint
ALTER TABLE "seen_news" ADD CONSTRAINT "seen_news_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;