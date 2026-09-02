import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// userId is nullable per DATA_MODEL.md, matching the ScrapeRun/anonymous-run
// pattern — but SPEC.md §1 says anonymous runs never persist a JobConfig in
// practice, so every row written by the app will have userId set.
export const jobConfig = pgTable("job_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  // `title` is both the human-readable label and the literal search term
  // sent to each site's search (Apec `motsCles`, HelloWork `k`).
  title: text("title").notNull(),
  // Per-config exclusion keywords — listing titles matching any of these are
  // tagged `Listing.excludedByKeyword` at scrape time (see
  // `lib/filters/exclusion-matching.ts`). Optional; `[]` = exclude nothing.
  excludedKeywords: text("excluded_keywords").array().notNull().default([]),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
