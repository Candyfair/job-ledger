import { schedules } from "@trigger.dev/sdk/v3";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun, scrapeRunSite } from "@/drizzle/schema";
import { recomputeAndWriteRunStatus } from "@/lib/run-status";

/**
 * A run still `running` this long after `triggeredAt` is treated as having a
 * task that never reported back. 15 minutes sits above the global Trigger.dev
 * `maxDuration: 600` (10 min) task ceiling in `trigger.config.ts` — any site
 * task that was going to finish, throw, or be SIGKILLed at the ceiling has
 * already done so — plus a margin for queue wait and the final DB write.
 */
const STALE_AFTER_MS = 15 * 60 * 1000;

interface FinalizeStaleRunsResult {
  /** Number of `scrape_run` rows the recompute moved off `running`. */
  finalized: number;
}

/**
 * Backstop for the run-status rollup (SPEC.md §4/§9). The rollup relies on
 * every site task writing its own `ScrapeRunSite` row and then calling
 * `recomputeAndWriteRunStatus`. A task that crashed ("System failure"), was
 * SIGKILLed at `maxDuration`, or otherwise died leaves its row stuck at
 * `outcome = 'pending'` — and `combineRunStatus` reads any `pending` as
 * `running`, so the run would show as in-progress forever.
 *
 * This sweep finds every run still `running` past {@link STALE_AFTER_MS},
 * flips its remaining `pending` `ScrapeRunSite` rows to
 * `outcome = 'failed'`, `failureCause = 'timeout'` (the orphaned-task cause —
 * never a `SiteStatus` flip, an orphaned task is not a site-wide fault), and
 * then calls `recomputeAndWriteRunStatus` like every other write path. It
 * does **not** write `scrape_run.status` itself —
 * `recomputeAndWriteRunStatus` stays the single writer of that column.
 *
 * A run whose tasks all genuinely finished has no `pending` rows left, so its
 * recompute is a no-op and it is untouched. When every site task reports
 * promptly this sweep finalizes nothing.
 *
 * Side effects, per stale run: one
 * `UPDATE scrape_run_site SET outcome='failed', failure_cause='timeout'`
 * over that run's `pending` rows, then one `recomputeAndWriteRunStatus`
 * (which may `UPDATE scrape_run.status`). Idempotent — once a run is off
 * `running` it no longer matches.
 *
 * @param now - injectable clock for tests; defaults to the real current time.
 */
export async function finalizeStaleRuns(
  now: Date = new Date(),
): Promise<FinalizeStaleRunsResult> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);

  const staleRuns = await db
    .select({ id: scrapeRun.id })
    .from(scrapeRun)
    .where(
      and(eq(scrapeRun.status, "running"), lt(scrapeRun.triggeredAt, cutoff)),
    );

  let finalized = 0;
  for (const { id } of staleRuns) {
    await db
      .update(scrapeRunSite)
      .set({
        outcome: "failed",
        failureCause: "timeout",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scrapeRunSite.scrapeRunId, id),
          eq(scrapeRunSite.outcome, "pending"),
        ),
      );

    const status = await recomputeAndWriteRunStatus(id);
    if (status !== "running") finalized += 1;
  }

  return { finalized };
}

/**
 * Runs {@link finalizeStaleRuns} every 10 minutes. The cadence is finer than
 * {@link STALE_AFTER_MS} so a stuck run resolves within roughly one interval
 * of crossing the threshold, and a skipped tick is still caught on the next.
 *
 * Side effects: those of {@link finalizeStaleRuns}. Emits a `console.warn`
 * only when it actually finalized at least one run, so a healthy system
 * produces silent ticks.
 */
export const finalizeStaleRunsSchedule = schedules.task({
  id: "finalize-stale-runs",
  cron: "*/10 * * * *",
  run: async (): Promise<FinalizeStaleRunsResult> => {
    const result = await finalizeStaleRuns();
    if (result.finalized > 0) {
      console.warn(
        `finalize-stale-runs: forced ${result.finalized} stale run(s) off "running" via the rollup`,
      );
    }
    return result;
  },
});
