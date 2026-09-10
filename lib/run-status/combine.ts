import {
  scrapeRunSiteOutcomeEnum,
  scrapeRunStatusEnum,
} from "@/drizzle/schema";

/**
 * Per-task outcome recorded on one `ScrapeRunSite` row — one row per actual
 * Trigger.dev site task. Mirrors the `scrape_run_site_outcome` pgEnum.
 */
export type Outcome = (typeof scrapeRunSiteOutcomeEnum.enumValues)[number];

/**
 * A run's overall persisted status (`ScrapeRun.status`). Mirrors the
 * `scrape_run_status` pgEnum — unchanged by the rollup: `combineRunStatus`
 * only ever produces one of these three.
 */
export type ScrapeRunStatus = (typeof scrapeRunStatusEnum.enumValues)[number];

/**
 * Tier-1 precedence for {@link combineSiteOutcome}: the first outcome in this
 * list that appears among a site's task rows wins. `pending` first so a site
 * with any unfinished task always reads as still-running; `skipped` last so a
 * kill-switch skip never masks a real result from a sibling `JobConfig` on
 * the same site.
 */
const SITE_OUTCOME_PRECEDENCE: readonly Outcome[] = [
  "pending",
  "failed",
  "empty_extraction",
  "completed",
  "skipped",
];

/**
 * Combines every `ScrapeRunSite.outcome` that shares the same
 * `(scrapeRunId, site)` — i.e. across a run's `JobConfig`s for that one site —
 * into a single site-level outcome (SPEC.md §4, run-status rollup, tier 1).
 *
 * Highest precedence wins: `pending > failed > empty_extraction > completed >
 * skipped` (see {@link SITE_OUTCOME_PRECEDENCE}). Order-independent.
 *
 * For an anonymous run, or an authenticated run with exactly one `JobConfig`
 * on this site, `taskOutcomes` has a single element and that element is
 * returned unchanged.
 *
 * Pure — no I/O. An empty input returns `"pending"` defensively (a real
 * caller always passes at least one row, since
 * `POST /api/scrape/trigger` pre-creates them); callers should not rely on
 * that path.
 */
export function combineSiteOutcome(taskOutcomes: Outcome[]): Outcome {
  if (taskOutcomes.length === 0) return "pending";
  const present = new Set(taskOutcomes);
  return (
    SITE_OUTCOME_PRECEDENCE.find((outcome) => present.has(outcome)) ??
    // Unreachable while every Outcome is listed in the precedence table —
    // kept so an added enum value fails loud in review rather than silently
    // resolving to the wrong bucket.
    taskOutcomes[0]
  );
}

/**
 * Combines every site's tier-1 outcome (from {@link combineSiteOutcome}) into
 * the run's overall `ScrapeRun.status` (SPEC.md §4, run-status rollup, tier
 * 2). Order-independent.
 *
 * - any `pending`                  → `"running"`
 * - else any `failed`              → `"partial_failure"`
 * - else any `empty_extraction`    → `"partial_failure"`
 * - else any `completed`           → `"completed"`
 * - else (only `skipped` remain)   → `"partial_failure"`
 *
 * The all-`skipped` case is a `partial_failure`, not a `completed`: the run
 * was asked for and produced nothing because the operator stopped it, which
 * the dashboard should not present as a clean success.
 *
 * Pure — no I/O. An empty input returns `"running"` defensively.
 */
export function combineRunStatus(siteOutcomes: Outcome[]): ScrapeRunStatus {
  if (siteOutcomes.length === 0) return "running";
  const present = new Set(siteOutcomes);
  if (present.has("pending")) return "running";
  if (present.has("failed")) return "partial_failure";
  if (present.has("empty_extraction")) return "partial_failure";
  if (present.has("completed")) return "completed";
  return "partial_failure";
}
