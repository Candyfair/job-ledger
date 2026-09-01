import { redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { getRunHistory } from "@/lib/dashboard/run-history";
import { getRunStatus } from "@/lib/dashboard/get-run-status";
import { getOwnedRun } from "@/lib/dashboard/run-ownership";
import { getListingsPage } from "@/lib/dashboard/listing-query";
import { encodeCursor } from "@/lib/dashboard/cursor";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

/**
 * The dashboard (SPEC.md §1/§3/§6). Two reachable view states — a third,
 * "nothing to show yet", redirects to `/trigger-scrape` instead of rendering
 * here (SPEC.md §3):
 *
 * 1. Authenticated with ≥1 `ScrapeRun`: run-history strip (own ScrapeRuns) +
 *    listings for the selected run, or an "all time" aggregate across the
 *    user's own runs when no `?runId=` (or an unowned one) is given.
 * 2. Anonymous + `?runId=` resolving to a `userId IS NULL` run: single-run
 *    view, no history strip, no aggregate.
 *
 * Everything else — authenticated with zero runs, anonymous with no
 * `runId`, or anonymous with a `runId` that doesn't resolve (nonexistent, or
 * belongs to someone else, treated identically so existence is never
 * leaked) — redirects to `/trigger-scrape`, the only place with something
 * for a first-time or run-less visitor to actually do.
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

    if (runs.length === 0) {
      redirect("/trigger-scrape");
    }

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
    redirect("/trigger-scrape");
  }

  const status = await getRunStatus(runId, null);
  if (!status) {
    redirect("/trigger-scrape");
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
