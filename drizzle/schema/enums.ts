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
// - timeout: an orchestrated site task never reported an outcome — it crashed,
//   was SIGKILLed at maxDuration, or otherwise died without writing its own
//   ScrapeRunSite row. Set ONLY by the stale-run watchdog
//   (trigger/finalize-stale-runs.ts) on ScrapeRunSite.failureCause; never
//   written to SiteStatus.lastFailureCause (neither describeScrapeError nor
//   markSiteFailed produce it) — an orphaned task is not a site-wide fault.
export const siteFailureCauseEnum = pgEnum("site_failure_cause", [
  "markup_broken",
  "bot_challenge",
  "timeout",
]);

// Per-task outcome on ScrapeRunSite — one value per actual Trigger.dev site
// task (see drizzle/schema/scrape-run-site.ts). The run-status rollup
// (SPEC.md §4) combines these: combineSiteOutcome across a site's jobConfigs,
// then combineRunStatus across sites (lib/run-status/).
// - pending: row pre-created by POST /api/scrape/trigger, task not yet done.
// - completed: listings written (or a legitimately empty in-window result).
// - empty_extraction: extraction degraded (anyPageExtractionFailed) or zero
//   listings — a per-run partial_failure signal, never a SiteStatus flip.
// - failed: the scrape threw (markup_broken / bot_challenge), or the watchdog
//   found the task orphaned (timeout). Pairs with failureCause.
// - skipped: the kill switch was active — deliberate operator stop, not a
//   fault (SPEC.md §9).
export const scrapeRunSiteOutcomeEnum = pgEnum("scrape_run_site_outcome", [
  "pending",
  "completed",
  "empty_extraction",
  "failed",
  "skipped",
]);
