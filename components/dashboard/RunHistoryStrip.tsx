"use client";

import type { RunHistoryEntry } from "@/lib/dashboard/run-history";
import { formatDateTime } from "@/lib/dashboard/format-relative-date";

const STATUS_LABELS: Record<RunHistoryEntry["status"], string> = {
  running: "EN COURS",
  completed: "TERMINÉ",
  partial_failure: "ÉCHEC PARTIEL",
};

// No existing "success"/failure color token exists anywhere else in this
// codebase (only zinc/black/white/blue-600/blue-50 are used) — blue-600 for
// in-progress and rose-600 for failure are new additions, flagged rather
// than silently invented.
const STATUS_DOT_CLASS: Record<RunHistoryEntry["status"], string> = {
  running: "bg-blue-600",
  completed: "bg-zinc-400",
  partial_failure: "bg-rose-600",
};

/**
 * Authenticated dashboard's run-history strip (design/dashboard.jpeg):
 * newest first, clickable to filter the listings below to that run.
 * Clicking the already-selected run deselects it back to the "all time"
 * aggregate. Does not itself poll for live updates — only the anonymous
 * single-run view has that requirement (SPEC.md §3).
 */
export function RunHistoryStrip({
  runs,
  latestRunId,
  selectedRunId,
  onSelectRun,
  hasMore,
  onLoadMore,
  loadingMore,
}: {
  runs: RunHistoryEntry[];
  latestRunId: string | null;
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 md:flex-row md:flex-wrap md:items-start md:gap-6">
      {runs.map((run) => (
        <button
          key={run.runId}
          type="button"
          onClick={() =>
            onSelectRun(selectedRunId === run.runId ? null : run.runId)
          }
          aria-pressed={selectedRunId === run.runId}
          className={
            "flex flex-col items-start gap-1 rounded border px-3 py-2 text-left text-sm " +
            (selectedRunId === run.runId
              ? "border-black bg-zinc-50"
              : "border-transparent hover:border-zinc-200")
          }
        >
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[run.status]}`}
            />
            <span className="font-medium text-zinc-900">
              {formatDateTime(run.triggeredAt)}
            </span>
            {run.runId === latestRunId && (
              <span className="rounded bg-black px-1.5 py-0.5 text-[10px] font-semibold text-white">
                DERNIER
              </span>
            )}
          </span>
          <span className="text-xs text-zinc-500">
            {STATUS_LABELS[run.status]} · {run.kept} conservées · {run.excluded}{" "}
            exclues
          </span>
        </button>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
        >
          {loadingMore ? "Chargement…" : "Charger plus"}
        </button>
      )}
    </div>
  );
}
