import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRunSite } from "@/drizzle/schema";
import type { Site } from "@/lib/sites";
import type { SiteFailureCause } from "@/lib/scraping/errors";
import type { Outcome } from "./combine";

/**
 * Anything that can run a query — the real `db` or a transaction handle
 * passed by a caller that already owns a transaction. Structural, so both
 * satisfy it.
 */
export type DbExecutor = Pick<typeof db, "insert" | "update">;

interface WriteSiteOutcomeArgs {
  scrapeRunId: string;
  site: Site;
  /** The id from THIS task's own invocation payload
   * (`payload.jobConfigId ?? null`) — `null` for an anonymous run. Never a
   * value resolved from a later DB lookup, which a kill switch or early
   * failure can skip. */
  jobConfigId: string | null;
  outcome: Outcome;
  /** Only meaningful when `outcome === "failed"`. */
  failureCause?: SiteFailureCause | null;
  /** Defaults to 0 (the `failed` / `skipped` / `empty_extraction` cases). */
  listingCount?: number;
}

/**
 * Writes one site task's own `ScrapeRunSite` row and nothing else (SPEC.md §4,
 * run-status rollup). This write is **lock-free**: the row's unique key is
 * `(scrapeRunId, site, jobConfigId)` — one key per Trigger.dev task — so
 * sibling tasks in the same fan-out never contend. The caller then delegates
 * to {@link recomputeAndWriteRunStatus}, which is the sole writer of
 * `ScrapeRun.status` and the only place that takes a row lock.
 *
 * `POST /api/scrape/trigger` pre-creates every row with `outcome: "pending"`,
 * so on the orchestrated path this is an UPDATE. The INSERT fallback covers
 * the standalone create paths (Trigger.dev Test tab, `scripts/test-scrape-*`)
 * where the task made its own `ScrapeRun` and no row was pre-created — matched
 * by row count, since an unmatched UPDATE is not an error.
 *
 * Side effect: one row UPDATE (or INSERT) on `scrape_run_site`. `updatedAt` is
 * bumped on every call.
 */
export async function writeSiteOutcome(
  executor: DbExecutor,
  {
    scrapeRunId,
    site,
    jobConfigId,
    outcome,
    failureCause = null,
    listingCount = 0,
  }: WriteSiteOutcomeArgs,
): Promise<void> {
  const updated = await executor
    .update(scrapeRunSite)
    .set({
      outcome,
      failureCause,
      listingCount,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scrapeRunSite.scrapeRunId, scrapeRunId),
        eq(scrapeRunSite.site, site),
        jobConfigId === null
          ? isNull(scrapeRunSite.jobConfigId)
          : eq(scrapeRunSite.jobConfigId, jobConfigId),
      ),
    )
    .returning({ id: scrapeRunSite.id });

  if (updated.length === 0) {
    await executor.insert(scrapeRunSite).values({
      scrapeRunId,
      site,
      jobConfigId,
      outcome,
      failureCause,
      listingCount,
    });
  }
}
