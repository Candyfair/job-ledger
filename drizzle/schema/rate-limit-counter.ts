import { pgTable, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Fixed-window per-IP rate limiter for POST /api/scrape/trigger (SPEC.md §7).
// `ipAddress` is unique so `checkTriggerRateLimit` can upsert a single row
// per IP (window reset in place) instead of appending a row per request —
// the table stays bounded by distinct IPs seen, not by request volume.
export const rateLimitCounter = pgTable("rate_limit_counter", {
  id: uuid("id").primaryKey().defaultRandom(),
  ipAddress: text("ip_address").notNull().unique(),
  windowStart: timestamp("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
