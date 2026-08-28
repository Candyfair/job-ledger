ALTER TABLE "site_status" ALTER COLUMN "site" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "scrape_run" ALTER COLUMN "sites_included" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "listing" ALTER COLUMN "site" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."site";--> statement-breakpoint
CREATE TYPE "public"."site" AS ENUM('apec', 'hellowork');--> statement-breakpoint
ALTER TABLE "site_status" ALTER COLUMN "site" SET DATA TYPE "public"."site" USING "site"::"public"."site";--> statement-breakpoint
ALTER TABLE "scrape_run" ALTER COLUMN "sites_included" SET DATA TYPE "public"."site"[] USING "sites_included"::"public"."site"[];--> statement-breakpoint
ALTER TABLE "listing" ALTER COLUMN "site" SET DATA TYPE "public"."site" USING "site"::"public"."site";