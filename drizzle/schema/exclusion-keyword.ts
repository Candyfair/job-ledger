import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// userId is nullable per DATA_MODEL.md (global/anonymous keyword lists are
// part of the documented shape), but SPEC.md §1 means every row the app
// writes today has userId set — see job-config.ts for the same note.
export const exclusionKeyword = pgTable("exclusion_keyword", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
