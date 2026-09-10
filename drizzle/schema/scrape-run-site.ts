import { pgTable, integer, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { scrapeRun } from "./scrape-run";
import { jobConfig } from "./job-config";
import {
  siteEnum,
  siteFailureCauseEnum,
  scrapeRunSiteOutcomeEnum,
} from "./enums";

// One row per actual Trigger.dev site task, matching the fan-out model in
// SPEC.md §7: the cartesian product sites × jobConfigIds for an authenticated
// run, sites only for an anonymous run. `jobConfigId` is null for anonymous
// rows.
//
// POST /api/scrape/trigger pre-creates every row with outcome 'pending', in
// the same transaction that creates the parent ScrapeRun, before any task is
// enqueued — so "at least one pending" is a reliable in-progress signal
// regardless of completion order (run-status rollup, SPEC.md §4). Each site
// task later writes only its own row (lock-free — the unique key below is
// per-task, so sibling writes never collide) and then delegates to
// recomputeAndWriteRunStatus (lib/run-status/), the sole writer of
// ScrapeRun.status.
//
// The unique constraint spans a nullable column: Postgres treats NULLs as
// distinct, so it does NOT dedupe two (runId, site, NULL) rows. Harmless in
// practice — an anonymous run has exactly one row per site, and the
// authenticated fan-out always carries a real jobConfigId.
export const scrapeRunSite = pgTable(
  "scrape_run_site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scrapeRunId: uuid("scrape_run_id")
      .notNull()
      .references(() => scrapeRun.id, { onDelete: "cascade" }),
    site: siteEnum("site").notNull(),
    // Real FK (unlike ScrapeRun.jobConfigsIncluded, which is a plain array
    // Postgres can't constrain). onDelete: cascade — if a JobConfig is
    // deleted, its granular per-config trace for a historical run goes with
    // it; ScrapeRun.status is persisted independently and unaffected. 'set
    // null' was rejected: two configs deleted on the same (run, site) would
    // silently collapse into two indistinguishable (runId, site, NULL) rows.
    jobConfigId: uuid("job_config_id").references(() => jobConfig.id, {
      onDelete: "cascade",
    }),
    outcome: scrapeRunSiteOutcomeEnum("outcome").notNull().default("pending"),
    // Set only when outcome = 'failed'.
    failureCause: siteFailureCauseEnum("failure_cause"),
    listingCount: integer("listing_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("scrape_run_site_run_site_config_uniq").on(
      t.scrapeRunId,
      t.site,
      t.jobConfigId,
    ),
  ],
);
