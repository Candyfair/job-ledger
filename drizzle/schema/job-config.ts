import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// userId is nullable per DATA_MODEL.md, matching the ScrapeRun/anonymous-run
// pattern — but SPEC.md §1 says anonymous runs never persist a JobConfig in
// practice, so every row written by the app will have userId set.
export const jobConfig = pgTable("job_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  keywords: text("keywords").array().notNull(),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
