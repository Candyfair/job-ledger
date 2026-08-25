ALTER TABLE "account" ADD COLUMN "issuer" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_unique" ON "account" USING btree ("issuer","account_id");