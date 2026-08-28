CREATE TYPE "public"."site_failure_cause" AS ENUM('markup_broken', 'bot_challenge');--> statement-breakpoint
ALTER TABLE "site_status" ADD COLUMN "last_failure_cause" "site_failure_cause";