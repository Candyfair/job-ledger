import { schedules } from "@trigger.dev/sdk/v3";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun } from "@/drizzle/schema";

/**
 * A run still `running` this long after `triggeredAt` is treated as having
 * never reported back. 15 minutes sits above the global Trigger.dev
 * `maxDuration: 600` (10 min) task ceiling in `trigger.config.ts` — any site
 * task that was going to finish, throw, or be SIGKILLed at the ceiling has
 * already done so — plus a margin for queue wait and the final DB write.
 */
const STALE_AFTER_MS = 15 * 60 * 1000;

interface FinalizeStaleRunsResult {
  /** Number of `scrape_run` rows moved from `running` to `partial_failure`. */
  finalized: number;
}

/**
 * Watchdog for the `ScrapeRun.status` rollup gap (SPEC.md §9, derived-status
 * blind spot #1): no writer moves a run off its `"running"` default on the
 * production multi-site fan-out path, so a run whose site tasks crashed
 * ("System failure"), were SIGKILLed at `maxDuration`, or were skipped by the
 * kill switch stays `running` in the raw column forever and the dashboard
 * shows it as in-progress indefinitely.
 *
 * This is deliberately NOT the run-status rollup designed in SPEC.md §4/§7:
 * it never inspects per-site outcomes and never yields `completed`. It only
 * forces a conservative terminal state — any run still `running` after
 * {@link STALE_AFTER_MS} becomes `partial_failure`, because a run that never
 * reported back is not a clean success. When the real rollup lands it will
 * write the status before this sweep ever sees the row, and this becomes a
 * no-op.
 *
 * Side effect: a single `UPDATE scrape_run SET status = 'partial_failure'`
 * over the rows matching `status = 'running' AND triggered_at < now -
 * STALE_AFTER_MS`. No other table, no other column. Idempotent — once the
 * backlog is drained, repeated runs update nothing.
 *
 * @param now - injectable clock for tests; defaults to the real current time.
 */
export async function finalizeStaleRuns(
  now: Date = new Date(),
): Promise<FinalizeStaleRunsResult> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS);

  const updated = await db
    .update(scrapeRun)
    .set({ status: "partial_failure" })
    .where(
      and(eq(scrapeRun.status, "running"), lt(scrapeRun.triggeredAt, cutoff)),
    )
    .returning({ id: scrapeRun.id });

  return { finalized: updated.length };
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
        `finalize-stale-runs: forced ${result.finalized} stale run(s) to partial_failure`,
      );
    }
    return result;
  },
});
