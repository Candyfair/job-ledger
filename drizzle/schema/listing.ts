import {
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { scrapeRun } from "./scrape-run";
import { siteEnum } from "./enums";

// title and url are NOT NULL per DATA_MODEL.md / SPEC.md §4 — url is
// Playwright-captured (never LLM-produced), title is the only extraction
// field the LLM is required to fill. Every other extracted field is
// nullable and kept rather than dropped when absent.
//
// datePosted is deliberately `text`, not `timestamp`: Claude normalizes
// relative French date phrases to ISO-8601 during extraction, but the
// column stays text so a missing/unparsed date never blocks a write — code
// parses/compares it in lib/extraction/lookback-window.ts.
//
// excludedByKeyword and duplicateOfListingId exist now per DATA_MODEL.md's
// documented shape but are not written by this session's scraping task —
// populated by the exclusion/dedup passes in Session 4/5.
export const listing = pgTable("listing", {
  id: uuid("id").primaryKey().defaultRandom(),
  scrapeRunId: uuid("scrape_run_id")
    .notNull()
    .references(() => scrapeRun.id, { onDelete: "cascade" }),
  site: siteEnum("site").notNull(),
  title: text("title").notNull(),
  company: text("company"),
  companyNormalized: text("company_normalized"),
  roleCanonical: text("role_canonical"),
  datePosted: text("date_posted"),
  salaryRaw: text("salary_raw"),
  url: text("url").notNull(),
  excludedByKeyword: text("excluded_by_keyword").array(),
  duplicateOfListingId: uuid("duplicate_of_listing_id").references(
    (): AnyPgColumn => listing.id,
  ),
  // Added for the dashboard's "Last write … N rows stored" footer
  // (design/dashboard.jpeg) — ScrapeRun.triggeredAt is run-level, not
  // per-row, so it can't answer "when was this specific listing written."
  // Backfilled rows (pre-migration) get the migration's execution time, not
  // their real scrape time — an accepted approximation, not a data source
  // of truth for historical analysis.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
