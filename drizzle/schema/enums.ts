import { pgEnum } from "drizzle-orm/pg-core";
import { SITES } from "@/lib/sites";

export const siteEnum = pgEnum("site", SITES);

// Mirrors SPEC.md §3's "running / completed / partial failure" status wording.
export const scrapeRunStatusEnum = pgEnum("scrape_run_status", [
  "running",
  "completed",
  "partial_failure",
]);

// deepseek_v4_flash is reserved now (not implemented until Session 6) so this
// column doesn't need a migration when the DeepSeek adapter lands.
export const modelUsedEnum = pgEnum("model_used", [
  "claude_haiku",
  "deepseek_v4_flash",
]);

export const lookbackWindowTypeEnum = pgEnum("lookback_window_type", [
  "24h",
  "3d",
  "since_date",
]);
