"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/dashboard/SegmentedControl";
import { ExcludedModeSelect } from "@/components/dashboard/ExcludedModeSelect";
import { RunHistoryStrip } from "@/components/dashboard/RunHistoryStrip";
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
import type { RunStatusPayload } from "@/lib/dashboard/derive-run-status";
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
 * Top-level client component for both real dashboard view states
 * (authenticated with run-history strip, anonymous single-run via
 * `?runId=`) — the third state (anonymous, no `runId`) is `EmptyState` and
 * never reaches this component. Owns exclusion-mode/duplicate-expand UI
 * state (client-side only, resets on reload per SPEC.md §3), the "load
 * more" pagination for both runs and listings, and — anonymous mode only —
 * status polling.
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

  const anonymousInitialStatus =
    props.mode === "anonymous-run" ? props.initialStatus : null;
  const polledStatus = useRunStatusPolling(
    anonymousInitialStatus?.runId ?? null,
    anonymousInitialStatus,
  );

  // Once an anonymous run leaves "running", refresh listings once — this
  // does not keep re-fetching listings on every subsequent poll tick, only
  // the single transition out of "running".
  const previousPollStatusRef = useRef(anonymousInitialStatus?.status);
  useEffect(() => {
    if (props.mode !== "anonymous-run" || !polledStatus) return;
    const wasRunning = previousPollStatusRef.current === "running";
    previousPollStatusRef.current = polledStatus.status;
    if (!wasRunning || polledStatus.status === "running") return;

    fetch(`/api/listings?runId=${polledStatus.runId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setListings(data.listings);
        setListingsCursor(data.nextCursor);
      })
      .catch(() => {});
  }, [polledStatus, props.mode]);

  const runId =
    props.mode === "anonymous-run" ? props.initialStatus.runId : null;

  const currentRunSummary: RunStatusPayload | null =
    props.mode === "anonymous-run"
      ? polledStatus
      : (runs.find((r) => r.runId === props.selectedRunId) ?? null);

  async function loadMoreListings() {
    if (!listingsCursor || loadingMoreListings) return;
    setLoadingMoreListings(true);
    try {
      const params = new URLSearchParams({ cursor: listingsCursor });
      if (runId) params.set("runId", runId);
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
    router.push(selected ? `/?runId=${selected}` : "/");
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
  const lastWriteIso = listings[0]?.createdAt ?? null;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b-4 border-black bg-zinc-100 px-6 py-6">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between">
          <h1 className="text-3xl font-bold text-zinc-900">The Job Ledger</h1>
          <Link
            href="/trigger-scrape"
            className="text-xs font-medium tracking-wide text-blue-700 hover:underline"
          >
            LANCER UN SCRAPING →
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
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
            {visibleListings.length} annonces · {excludedCount} exclues ·{" "}
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
