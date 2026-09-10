import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { listing, scrapeRunSite } from "@/drizzle/schema";
import { getOwnedRun, type Session } from "@/lib/dashboard/run-ownership";
import {
  assembleRunStatus,
  type RunStatusPayload,
} from "@/lib/dashboard/assemble-run-status";

/**
 * Ownership-checked status for a single run — the shared read used by both
 * `app/page.tsx` (SSR initial paint) and
 * `app/api/scrape/status/[runId]/route.ts` (client polling), so the two can
 * never disagree about what a viewer is allowed to see. Returns `null` for
 * both "no such run" and "exists but not owned by this caller" — see
 * `getOwnedRun`.
 *
 * `ScrapeRun.status` is read persisted (the run-status rollup, SPEC.md §4,
 * keeps it current); this function only fetches the `ScrapeRunSite` rows for
 * the per-site breakdown and the `Listing` rows for the kept/excluded/
 * duplicate counts, then hands both to {@link assembleRunStatus}.
 */
export async function getRunStatus(
  runId: string,
  session: Session,
): Promise<RunStatusPayload | null> {
  const run = await getOwnedRun(runId, session);
  if (!run) return null;

  const [runListings, siteRows] = await Promise.all([
    db.select().from(listing).where(eq(listing.scrapeRunId, run.id)),
    db
      .select()
      .from(scrapeRunSite)
      .where(eq(scrapeRunSite.scrapeRunId, run.id)),
  ]);

  return assembleRunStatus({ run, siteRows, listings: runListings });
}
