"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/dashboard/SegmentedControl";
import { ExcludedModeSelect } from "@/components/dashboard/ExcludedModeSelect";
import { RunHistoryStrip } from "@/components/dashboard/RunHistoryStrip";
import { StatusBanner } from "@/components/dashboard/StatusBanner";
import { ClaimRunPrompt } from "@/components/dashboard/ClaimRunPrompt";
import { DesktopListingsTable } from "@/components/dashboard/DesktopListingsTable";
import { MobileListingsCards } from "@/components/dashboard/MobileListingsCards";
import { useRunStatusPolling } from "@/components/dashboard/useRunStatusPolling";
import {
  EXCLUSION_MODE_OPTIONS,
  type ExclusionMode,
} from "@/lib/dashboard/exclusion-mode";
import {
  groupListingsByDuplicates,
  isExcluded,
} from "@/lib/dashboard/group-listings";
import {
  formatDateTime,
  formatMinutesAgo,
} from "@/lib/dashboard/format-relative-date";
import type { ListingDTO } from "@/lib/dashboard/listing-query";
import type { RunHistoryEntry } from "@/lib/dashboard/run-history";
import type { RunStatusPayload } from "@/lib/dashboard/assemble-run-status";
import { SITES, SITE_LABELS } from "@/lib/sites";
import { MODEL_OPTIONS } from "@/lib/extraction/model-options";

type AuthenticatedProps = {
  mode: "authenticated";
  initialRuns: RunHistoryEntry[];
  initialRunsCursor: string | null;
  selectedRunId: string | null;
  initialListings: ListingDTO[];
  initialListingsCursor: string | null;
};

type AnonymousRunProps = {
  mode: "anonymous-run";
  initialStatus: RunStatusPayload;
  initialListings: ListingDTO[];
  initialListingsCursor: string | null;
};

type DashboardClientProps = AuthenticatedProps | AnonymousRunProps;

/**
 * Top-level client component for the two reachable dashboard view states
 * (authenticated with run-history strip, anonymous single-run via
 * `?runId=`) — every other case (no runs, no `runId`, or an unresolved
 * `runId`) redirects to `/` in `app/dashboard/page.tsx` before this
 * component ever renders. Owns exclusion-mode/duplicate-expand UI state
 * (client-side only, resets on reload per SPEC.md §3), the "load more"
 * pagination for both runs and listings, and status polling / the status
 * banner — now active for both modes (SPEC.md §3, decided 2026-09-07).
 */
export function DashboardClient(props: DashboardClientProps) {
  const router = useRouter();

  const [exclusionMode, setExclusionMode] = useState<ExclusionMode>("folded");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    new Set(),
  );

  const [listings, setListings] = useState<ListingDTO[]>(props.initialListings);
  const [listingsCursor, setListingsCursor] = useState<string | null>(
    props.initialListingsCursor,
  );
  const [loadingMoreListings, setLoadingMoreListings] = useState(false);

  const [runs, setRuns] = useState<RunHistoryEntry[]>(
    props.mode === "authenticated" ? props.initialRuns : [],
  );
  const [runsCursor, setRunsCursor] = useState<string | null>(
    props.mode === "authenticated" ? props.initialRunsCursor : null,
  );
  const [loadingMoreRuns, setLoadingMoreRuns] = useState(false);

  // The run whose listings this view is scoped to, for "load more" paging:
  // the `?runId=` run in anonymous mode, the selected run (if any) when
  // authenticated. `null` means the authenticated all-time aggregate, which
  // `/api/listings` scopes to the session owner instead.
  const scopedRunId =
    props.mode === "anonymous-run"
      ? props.initialStatus.runId
      : props.selectedRunId;

  // The run the status banner/polling track. Anonymous: always the single
  // `?runId=` run. Authenticated: the selected run — or, with nothing
  // selected (the all-time aggregate), the most recent one. That fallback
  // matters because the post-trigger redirect for an authenticated run is
  // bare `/dashboard` (SPEC.md §3 step 4, no `?runId=`, unlike the anonymous
  // redirect) — without it, a visitor landing on the all-time view right
  // after triggering would never see progress on the run they just started.
  const bannerRunId =
    props.mode === "anonymous-run"
      ? props.initialStatus.runId
      : (props.selectedRunId ?? runs[0]?.runId ?? null);
  const bannerInitialStatus: RunStatusPayload | null =
    props.mode === "anonymous-run"
      ? props.initialStatus
      : (runs.find((r) => r.runId === bannerRunId) ?? null);

  const polledStatus = useRunStatusPolling(bannerRunId, bannerInitialStatus);

  // Tracks the tracked run's previous status so a "running → resolved"
  // transition can be detected exactly once. Deliberately `useState`, not a
  // `useRef`: this codebase's lint config (`react-hooks/refs`) disallows
  // reading/writing a ref during render, and both derivations below are
  // pure — no I/O — so they belong in the render-phase "storing information
  // from previous renders" pattern, not a `useEffect`
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [previousBannerStatus, setPreviousBannerStatus] = useState(
    bannerInitialStatus?.status,
  );
  // Whether to render the banner at all: while the tracked run is running,
  // or once it has been observed running during this page view — monotonic,
  // never reset, so the banner doesn't disappear the instant a run resolves
  // (see StatusBanner). A historical run selected from the strip that was
  // already resolved before this mount never sets this and never shows a
  // banner — the run-history strip's status dot already covers that case.
  const [bannerEverRunning, setBannerEverRunning] = useState(
    bannerInitialStatus?.status === "running",
  );

  if (polledStatus && polledStatus.status !== previousBannerStatus) {
    // Patches the tracked run's entry in the run-history strip the moment it
    // leaves "running", so the strip's status dot/label reflect the
    // resolved run without a full reload.
    if (previousBannerStatus === "running" && props.mode === "authenticated") {
      setRuns((prev) =>
        prev.map((r) => (r.runId === polledStatus.runId ? polledStatus : r)),
      );
    }
    if (polledStatus.status === "running") setBannerEverRunning(true);
    setPreviousBannerStatus(polledStatus.status);
  }

  // Once the tracked run leaves "running", refresh listings once (scoped the
  // same way "load more" is — the whole all-time aggregate when nothing is
  // selected, not just the one run). This *is* effect territory — actual
  // network I/O, unlike the render-phase updates above. Its own ref is fine
  // here: it's only ever read/written inside the effect callback, never
  // during render. Does not keep re-fetching on every subsequent poll tick,
  // only the single transition out of "running".
  const previousFetchStatusRef = useRef(bannerInitialStatus?.status);
  useEffect(() => {
    if (!polledStatus) return;
    const wasRunning = previousFetchStatusRef.current === "running";
    previousFetchStatusRef.current = polledStatus.status;
    if (!wasRunning || polledStatus.status === "running") return;

    const params = new URLSearchParams();
    if (scopedRunId) params.set("runId", scopedRunId);
    fetch(`/api/listings?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setListings(data.listings);
        setListingsCursor(data.nextCursor);
      })
      .catch(() => {});
  }, [polledStatus, scopedRunId]);

  const currentRunSummary = polledStatus;

  async function loadMoreListings() {
    if (!listingsCursor || loadingMoreListings) return;
    setLoadingMoreListings(true);
    try {
      const params = new URLSearchParams({ cursor: listingsCursor });
      if (scopedRunId) params.set("runId", scopedRunId);
      const res = await fetch(`/api/listings?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setListings((prev) => [...prev, ...data.listings]);
        setListingsCursor(data.nextCursor);
      }
    } finally {
      setLoadingMoreListings(false);
    }
  }

  async function loadMoreRuns() {
    if (!runsCursor || loadingMoreRuns) return;
    setLoadingMoreRuns(true);
    try {
      const res = await fetch(
        `/api/scrape/runs?cursor=${encodeURIComponent(runsCursor)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setRuns((prev) => [...prev, ...data.runs]);
        setRunsCursor(data.nextCursor);
      }
    } finally {
      setLoadingMoreRuns(false);
    }
  }

  function selectRun(selected: string | null) {
    router.push(selected ? `/dashboard?runId=${selected}` : "/dashboard");
  }

  function toggleGroup(primaryId: string) {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(primaryId)) {
        next.delete(primaryId);
      } else {
        next.add(primaryId);
      }
      return next;
    });
  }

  const visibleListings =
    exclusionMode === "hidden"
      ? listings.filter((l) => !isExcluded(l))
      : listings;
  const groups = useMemo(
    () => groupListingsByDuplicates(visibleListings),
    [visibleListings],
  );

  const excludedCount =
    exclusionMode === "hidden" ? 0 : listings.filter(isExcluded).length;
  const duplicateGroupCount = groups.filter(
    (g) => g.duplicates.length > 0,
  ).length;
  // Rows actually on screen: one per group, plus a group's folded duplicates
  // only while it is expanded. Not `visibleListings.length`, which also counts
  // duplicates that render inside their primary's group rather than as a row.
  const renderedRowCount = groups.reduce(
    (total, group) =>
      total +
      1 +
      (expandedGroupIds.has(group.primary.id) ? group.duplicates.length : 0),
    0,
  );
  const lastWriteIso = listings[0]?.createdAt ?? null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b-4 border-black bg-zinc-100 px-6 py-6">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between">
          <h1 className="text-3xl font-bold text-zinc-900">The Job Ledger</h1>
          <Link
            href="/"
            className="text-xs font-medium tracking-wide text-blue-700 hover:underline"
          >
            RELANCER UNE RECHERCHE →
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
        {bannerEverRunning && polledStatus && (
          <StatusBanner status={polledStatus} />
        )}

        {props.mode === "anonymous-run" &&
          polledStatus &&
          polledStatus.status !== "running" && (
            <ClaimRunPrompt runId={polledStatus.runId} />
          )}

        {props.mode === "authenticated" && (
          <RunHistoryStrip
            runs={runs}
            latestRunId={runs[0]?.runId ?? null}
            selectedRunId={props.selectedRunId}
            onSelectRun={selectRun}
            hasMore={runsCursor !== null}
            onLoadMore={loadMoreRuns}
            loadingMore={loadingMoreRuns}
          />
        )}

        {currentRunSummary && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
            <span>
              Modèle :{" "}
              <span className="italic">
                {MODEL_OPTIONS.find((o) => o.value === currentRunSummary.model)
                  ?.label ?? currentRunSummary.model}
              </span>
            </span>
            {SITES.map((site) => (
              <span key={site}>
                {currentRunSummary.sitesIncluded.includes(site) ? "✓" : "—"}{" "}
                {SITE_LABELS[site]}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-zinc-600">
            {renderedRowCount} annonces · {excludedCount} exclues ·{" "}
            {duplicateGroupCount} groupes de doublons · triées du plus récent
          </p>
          <div className="hidden md:block">
            <SegmentedControl
              options={EXCLUSION_MODE_OPTIONS}
              value={exclusionMode}
              onChange={setExclusionMode}
            />
          </div>
          <div className="md:hidden">
            <ExcludedModeSelect
              value={exclusionMode}
              onChange={setExclusionMode}
            />
          </div>
        </div>

        <DesktopListingsTable
          groups={groups}
          mode={exclusionMode}
          expandedGroupIds={expandedGroupIds}
          onToggleGroup={toggleGroup}
        />
        <MobileListingsCards
          groups={groups}
          mode={exclusionMode}
          expandedGroupIds={expandedGroupIds}
          onToggleGroup={toggleGroup}
        />

        {listingsCursor && (
          <button
            type="button"
            onClick={loadMoreListings}
            disabled={loadingMoreListings}
            className="w-fit text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
          >
            {loadingMoreListings ? "Chargement…" : "Charger plus"}
          </button>
        )}

        <footer className="flex flex-col gap-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
          <p>
            Rien n&apos;est jamais supprimé — les doublons sont regroupés, les
            exclusions sont repliées.
          </p>
          {lastWriteIso && (
            <p>
              Dernière écriture {formatDateTime(lastWriteIso)} (
              {formatMinutesAgo(lastWriteIso)}) · {listings.length} lignes
              enregistrées
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}
