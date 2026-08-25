CREATE TYPE "public"."lookback_window_type" AS ENUM('24h', '3d', 'since_date');--> statement-breakpoint
CREATE TYPE "public"."model_used" AS ENUM('claude_haiku', 'deepseek_v4_flash');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_status" AS ENUM('running', 'completed', 'partial_failure');--> statement-breakpoint
CREATE TYPE "public"."site" AS ENUM('welcome_to_the_jungle', 'indeed', 'apec', 'hellowork');--> statement-breakpoint
CREATE TABLE "site_status" (
	"site" "site" PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_error_at" timestamp,
	"last_error_note" text
);
--> statement-breakpoint
CREATE TABLE "scrape_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"lookback_window_type" "lookback_window_type" NOT NULL,
	"lookback_since" timestamp,
	"model_used" "model_used" NOT NULL,
	"sites_included" "site"[] NOT NULL,
	"job_configs_included" uuid[] DEFAULT '{}' NOT NULL,
	"status" "scrape_run_status" DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrape_run_id" uuid NOT NULL,
	"site" "site" NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"company_normalized" text,
	"role_canonical" text,
	"date_posted" text,
	"salary_raw" text,
	"url" text NOT NULL,
	"excluded_by_keyword" text[],
	"duplicate_of_listing_id" uuid
);
--> statement-breakpoint
ALTER TABLE "scrape_run" ADD CONSTRAINT "scrape_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_scrape_run_id_scrape_run_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_duplicate_of_listing_id_listing_id_fk" FOREIGN KEY ("duplicate_of_listing_id") REFERENCES "public"."listing"("id") ON DELETE no action ON UPDATE no action;