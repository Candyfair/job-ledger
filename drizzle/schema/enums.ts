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

// Why a site's scraper was auto-deactivated (SPEC.md §5). Recorded on
// SiteStatus so the settings page can show the right "needs review" message:
// - markup_broken: a selector timed out / the results structure no longer
//   matches — the site probably changed its markup.
// - bot_challenge: the site served a recognized bot-verification interstitial
//   (Cloudflare-style challenge copy) instead of results.
// Both drive the same active: false deactivation; only the message differs.
export const siteFailureCauseEnum = pgEnum("site_failure_cause", [
  "markup_broken",
  "bot_challenge",
]);
