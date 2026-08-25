import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { siteEnum } from "./enums";

// One row per supported site, shared across all users (including anonymous) —
// `site` is the natural primary key per DATA_MODEL.md, no surrogate id.
// Rows are not seeded for all 4 sites up front: a missing row means "not yet
// scraped / unknown", not "confirmed broken" — active defaults to true.
export const siteStatus = pgTable("site_status", {
  site: siteEnum("site").primaryKey(),
  active: boolean("active").default(true).notNull(),
  lastErrorAt: timestamp("last_error_at"),
  lastErrorNote: text("last_error_note"),
});
