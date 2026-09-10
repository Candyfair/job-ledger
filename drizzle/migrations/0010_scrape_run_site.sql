CREATE TYPE "public"."scrape_run_site_outcome" AS ENUM('pending', 'completed', 'empty_extraction', 'failed', 'skipped');--> statement-breakpoint
ALTER TYPE "public"."site_failure_cause" ADD VALUE 'timeout';--> statement-breakpoint
CREATE TABLE "scrape_run_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrape_run_id" uuid NOT NULL,
	"site" "site" NOT NULL,
	"job_config_id" uuid,
	"outcome" "scrape_run_site_outcome" DEFAULT 'pending' NOT NULL,
	"failure_cause" "site_failure_cause",
	"listing_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_run_site_run_site_config_uniq" UNIQUE("scrape_run_id","site","job_config_id")
);
--> statement-breakpoint
ALTER TABLE "scrape_run_site" ADD CONSTRAINT "scrape_run_site_scrape_run_id_scrape_run_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_run_site" ADD CONSTRAINT "scrape_run_site_job_config_id_job_config_id_fk" FOREIGN KEY ("job_config_id") REFERENCES "public"."job_config"("id") ON DELETE cascade ON UPDATE no action;