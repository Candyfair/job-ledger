import { redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import {
  getRunHistory,
  INITIAL_RUN_HISTORY_PAGE_SIZE,
} from "@/lib/dashboard/run-history";
import { getRunStatus } from "@/lib/dashboard/get-run-status";
import { getOwnedRun } from "@/lib/dashboard/run-ownership";
import { getListingsPage } from "@/lib/dashboard/listing-query";
import { encodeCursor } from "@/lib/dashboard/cursor";
import { getLinkedProviders } from "@/lib/account/linked-providers";
import { AccountHeader } from "@/components/account/AccountHeader";
import { RunClaimOnMount } from "@/components/account/RunClaimOnMount";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

/**
 * The dashboard (SPEC.md §1/§3/§6). Two reachable view states — a third,
 * "nothing to show yet", redirects to `/` instead of rendering here
 * (SPEC.md §3, §6):
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
 * leaked) — redirects to `/`, the only place with something for a
 * first-time or run-less visitor to actually do.
 *
 * `requireSession()` returning `null` here is an expected branch, not a
 * redirect-to-sign-in case — same pattern as `app/page.tsx`.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string; claimRunId?: string }>;
}) {
  const { runId, claimRunId } = await searchParams;
  const session = await requireSession();

  if (session) {
    const { runs, nextCursor: runsCursor } = await getRunHistory({
      userId: session.user.id,
      limit: INITIAL_RUN_HISTORY_PAGE_SIZE,
    });

    // A freshly authenticated visitor claiming an anonymous run (SPEC.md §3
    // "Create an account from an anonymous run", `OAuthButtons`'
    // `/dashboard?claimRunId=` landing, decided 2026-09-11) has zero owned
    // runs at this exact SSR pass — the claim itself only completes
    // client-side, after mount (`RunClaimOnMount`). Bouncing to `/` here
    // would drop `claimRunId` (a bare `redirect("/")` carries no query
    // string) and the claim would never fire. Render the empty shell
    // instead; `RunClaimOnMount` re-navigates to the claimed run once the
    // claim persists.
    if (runs.length === 0 && !claimRunId) {
      redirect("/");
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

    const providers = await getLinkedProviders(session.user.id);

    return (
      <>
        <RunClaimOnMount />
        <AccountHeader
          variant="authenticated"
          email={session.user.email}
          image={session.user.image ?? null}
          providers={providers}
        />
        <DashboardClient
          // Keyed by the selected run so switching runs remounts the client
          // with the freshly SSR-fetched, run-scoped listings — its listing
          // state is seeded from props once and never re-synced in place
          // (SPEC.md §3: client view state resets on reload anyway).
          key={selectedRunId ?? "all"}
          mode="authenticated"
          initialRuns={runs}
          initialRunsCursor={encodeCursor(runsCursor)}
          selectedRunId={selectedRunId}
          initialListings={listings}
          initialListingsCursor={encodeCursor(listingsCursor)}
        />
      </>
    );
  }

  if (!runId) {
    redirect("/");
  }

  const status = await getRunStatus(runId, null);
  if (!status) {
    redirect("/");
  }

  const { listings, nextCursor: listingsCursor } = await getListingsPage({
    runId,
  });

  return (
    <>
      <RunClaimOnMount />
      <AccountHeader variant="anonymous" runId={runId} />
      <DashboardClient
        mode="anonymous-run"
        initialStatus={status}
        initialListings={listings}
        initialListingsCursor={encodeCursor(listingsCursor)}
      />
    </>
  );
}
