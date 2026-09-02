import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import {
  siteEnum,
  scrapeRunStatusEnum,
  modelUsedEnum,
  lookbackWindowTypeEnum,
} from "./enums";

// userId is nullable — anonymous runs don't create one, same pattern as
// job-config.ts.
//
// lookbackWindowType + lookbackSince model SPEC.md §3's three lookback
// options (24h / 3 days / since a date) as a type-safe superset rather than
// a single stringly-typed column; lookbackSince is only set when the type is
// "since_date". This is provisional until Session 5's trigger form
// formalizes the exact input contract.
//
// jobConfigsIncluded is a plain uuid array, not a real FK — Postgres can't
// constrain array columns, so referential validity is enforced in app code
// (same simplification DATA_MODEL.md already accepts for this column).
export const scrapeRun = pgTable("scrape_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  lookbackWindowType: lookbackWindowTypeEnum("lookback_window_type").notNull(),
  lookbackSince: timestamp("lookback_since"),
  modelUsed: modelUsedEnum("model_used").notNull(),
  sitesIncluded: siteEnum("sites_included").array().notNull(),
  jobConfigsIncluded: uuid("job_configs_included")
    .array()
    .notNull()
    .default([]),
  status: scrapeRunStatusEnum("status").default("running").notNull(),
});
