import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { listing, siteStatus } from "@/drizzle/schema";
import { getOwnedRun, type Session } from "@/lib/dashboard/run-ownership";
import {
  deriveRunStatus,
  type RunStatusPayload,
} from "@/lib/dashboard/derive-run-status";

/**
 * Ownership-checked, derived status for a single run — the shared read used
 * by both `app/page.tsx` (SSR initial paint) and
 * `app/api/scrape/status/[runId]/route.ts` (client polling), so the two can
 * never disagree about what a viewer is allowed to see. Returns `null` for
 * both "no such run" and "exists but not owned by this caller" — see
 * `getOwnedRun`.
 */
export async function getRunStatus(
  runId: string,
  session: Session,
): Promise<RunStatusPayload | null> {
  const run = await getOwnedRun(runId, session);
  if (!run) return null;

  const [runListings, statuses] = await Promise.all([
    db.select().from(listing).where(eq(listing.scrapeRunId, run.id)),
    db
      .select()
      .from(siteStatus)
      .where(inArray(siteStatus.site, run.sitesIncluded)),
  ]);

  return deriveRunStatus({
    run,
    listings: runListings,
    siteStatuses: statuses,
  });
}
