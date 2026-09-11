import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun } from "@/drizzle/schema";

/**
 * Reattaches one anonymous `ScrapeRun` to a newly authenticated account
 * (SPEC.md §3 "Claiming an anonymous run" / §9 "Claim endpoint", decided
 * 2026-09-07). Idempotent: the `WHERE` clause only ever matches a row whose
 * `userId` is still `NULL`, so a run already claimed — by this user on a
 * repeat call, or by anyone else — is left untouched rather than
 * reassigned. Does not create a `JobConfig` from the run's ad hoc
 * parameters; that's still a manual step on `/` afterward.
 *
 * No ownership verification beyond "currently unowned" — a `runId` known to
 * a third party is technically claimable by them too. Accepted risk given
 * the non-sensitive nature of job-listing data (SPEC.md §3/§9); not a bug to
 * fix here without a design discussion first.
 */
export async function claimRun(runId: string, userId: string): Promise<void> {
  await db
    .update(scrapeRun)
    .set({ userId })
    .where(and(eq(scrapeRun.id, runId), isNull(scrapeRun.userId)));
}
