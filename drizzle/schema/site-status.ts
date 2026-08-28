import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { siteEnum, siteFailureCauseEnum } from "./enums";

// One row per supported site, shared across all users (including anonymous) —
// `site` is the natural primary key per DATA_MODEL.md, no surrogate id.
// Rows are not seeded for all 3 sites up front: a missing row means "not yet
// scraped / unknown", not "confirmed broken" — active defaults to true.
export const siteStatus = pgTable("site_status", {
  site: siteEnum("site").primaryKey(),
  active: boolean("active").default(true).notNull(),
  lastErrorAt: timestamp("last_error_at"),
  lastErrorNote: text("last_error_note"),
  // Null while active; set alongside active: false on every deactivation so
  // the settings page can distinguish a markup break from a bot block
  // (SPEC.md §5).
  lastFailureCause: siteFailureCauseEnum("last_failure_cause"),
});
