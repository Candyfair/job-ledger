import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun, scrapeRunSite } from "@/drizzle/schema";
import {
  combineRunStatus,
  combineSiteOutcome,
  type Outcome,
  type ScrapeRunStatus,
} from "./combine";

/**
 * Recomputes `ScrapeRun.status` from the current set of `ScrapeRunSite` rows
 * and writes it back — the **sole** code path allowed to write
 * `ScrapeRun.status` (SPEC.md §4, run-status rollup). Every site task calls
 * this after writing its own row via `writeSiteOutcome`; the stale-run
 * watchdog calls it after flagging orphaned rows. The individual tasks never
 * touch `ScrapeRun.status` directly.
 *
 * Concurrency: opens a transaction and takes a row lock on the `ScrapeRun`
 * row (`SELECT … FOR UPDATE`) so two site tasks finishing at the same instant
 * serialize here and the last writer reflects the final combined state. The
 * per-task `ScrapeRunSite` writes need no lock (unique key per task); only
 * this recompute does.
 *
 * Two-tier combine: group the run's `ScrapeRunSite` rows by `site`, apply
 * {@link combineSiteOutcome} within each site (across its `JobConfig`s), then
 * {@link combineRunStatus} across the per-site results. Writes only when the
 * value actually changes.
 *
 * Side effect: at most one `UPDATE scrape_run SET status = ?` per call,
 * inside the transaction. No-op (no write) when the recomputed status equals
 * the stored one, when the run has no `ScrapeRunSite` rows yet, or when the
 * run row is gone (cascade-deleted mid-flight).
 *
 * @returns the run's status after the recompute (written or already current).
 */
export async function recomputeAndWriteRunStatus(
  scrapeRunId: string,
): Promise<ScrapeRunStatus> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({ status: scrapeRun.status })
      .from(scrapeRun)
      .where(eq(scrapeRun.id, scrapeRunId))
      .for("update");

    if (!run) return "running";

    const rows = await tx
      .select({
        site: scrapeRunSite.site,
        outcome: scrapeRunSite.outcome,
      })
      .from(scrapeRunSite)
      .where(eq(scrapeRunSite.scrapeRunId, scrapeRunId));

    if (rows.length === 0) return run.status;

    const bySite = new Map<string, Outcome[]>();
    for (const row of rows) {
      const list = bySite.get(row.site) ?? [];
      list.push(row.outcome);
      bySite.set(row.site, list);
    }

    const next = combineRunStatus([...bySite.values()].map(combineSiteOutcome));

    if (next !== run.status) {
      await tx
        .update(scrapeRun)
        .set({ status: next })
        .where(eq(scrapeRun.id, scrapeRunId));
    }

    return next;
  });
}
