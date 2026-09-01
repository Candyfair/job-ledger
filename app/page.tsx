import { requireSession } from "@/lib/require-session";
import { getRunHistory } from "@/lib/dashboard/run-history";
import { getRunStatus } from "@/lib/dashboard/get-run-status";
import { getOwnedRun } from "@/lib/dashboard/run-ownership";
import { getListingsPage } from "@/lib/dashboard/listing-query";
import { encodeCursor } from "@/lib/dashboard/cursor";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { EmptyState } from "@/components/dashboard/EmptyState";

/**
 * The dashboard (SPEC.md §1/§3/§6). Three distinct view states:
 *
 * 1. Authenticated: run-history strip (own ScrapeRuns) + listings for the
 *    selected run, or an "all time" aggregate across the user's own runs
 *    when no `?runId=` (or an unowned one) is given.
 * 2. Anonymous + `?runId=` resolving to a `userId IS NULL` run: single-run
 *    view, no history strip, no aggregate.
 * 3. Anonymous, no `runId` (or it doesn't resolve — nonexistent, or belongs
 *    to someone else, treated identically so existence is never leaked):
 *    onboarding empty state linking to `/trigger-scrape`.
 *
 * `requireSession()` returning `null` here is an expected branch, not a
 * redirect-to-sign-in case — same pattern as `app/trigger-scrape/page.tsx`.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string }>;
}) {
  const { runId } = await searchParams;
  const session = await requireSession();

  if (session) {
    const { runs, nextCursor: runsCursor } = await getRunHistory({
      userId: session.user.id,
    });

    let selectedRunId: string | null = null;
    if (runId) {
      const owned = await getOwnedRun(runId, session);
      if (owned) selectedRunId = runId;
    }

    const { listings, nextCursor: listingsCursor } = await getListingsPage(
      selectedRunId
        ? { runId: selectedRunId }
        : { ownerUserId: session.user.id },
    );

    return (
      <DashboardClient
        mode="authenticated"
        initialRuns={runs}
        initialRunsCursor={encodeCursor(runsCursor)}
        selectedRunId={selectedRunId}
        initialListings={listings}
        initialListingsCursor={encodeCursor(listingsCursor)}
      />
    );
  }

  if (!runId) {
    return <EmptyState />;
  }

  const status = await getRunStatus(runId, null);
  if (!status) {
    return <EmptyState />;
  }

  const { listings, nextCursor: listingsCursor } = await getListingsPage({
    runId,
  });

  return (
    <DashboardClient
      mode="anonymous-run"
      initialStatus={status}
      initialListings={listings}
      initialListingsCursor={encodeCursor(listingsCursor)}
    />
  );
}
