ALTER TABLE "job_config" RENAME COLUMN "keywords" TO "excluded_keywords";--> statement-breakpoint
ALTER TABLE "job_config" ALTER COLUMN "excluded_keywords" SET DEFAULT '{}';--> statement-breakpoint
UPDATE "job_config" SET "excluded_keywords" = '{}';
