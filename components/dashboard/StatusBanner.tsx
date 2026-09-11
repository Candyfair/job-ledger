"use client";

import { useSyncExternalStore } from "react";
import type { RunStatusPayload } from "@/lib/dashboard/assemble-run-status";
import {
  BANNER_PEDAGOGICAL_COPY,
  BANNER_RUNNING_LINE,
  bannerCompletionLine,
} from "@/lib/dashboard/banner-copy";

/** Shared across anonymous and authenticated visitors (SPEC.md §3, §7
 * "Client-side storage") — no server sync, persists across visits and runs. */
const STORAGE_KEY = "bannerCollapsed";

// A tiny external store over localStorage, read via `useSyncExternalStore`
// rather than `useState` + a mount effect: SSR (and the client's very first
// render, to match that SSR HTML exactly) has no localStorage to read yet,
// so the collapsed flag has to be allowed to diverge safely right after
// hydration. `useSyncExternalStore` is the mechanism React provides for
// exactly that; a `useEffect` that calls `setState` synchronously on mount
// achieves the same result but is flagged by `react-hooks/set-state-in-effect`
// for the cascading-render risk it's warning about in the general case.
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Private browsing / blocked storage — default to expanded.
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

function setStoredCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Best-effort only — see getSnapshot.
  }
  notify();
}

/**
 * The dashboard's status banner (SPEC.md §3, decided 2026-09-07). The parent
 * (`DashboardClient`) decides *whether* to render this at all — only while
 * the tracked run is `running`, or once it has been observed `running`
 * during this page view (so a historical run picked from the run-history
 * strip, never watched live, doesn't grow a banner it was never showing).
 * This component only owns the collapsed/expanded presentation.
 *
 * Collapsed state lives in `localStorage[bannerCollapsed]`, read via
 * `useSyncExternalStore` (see above) — SSR and the client's first render are
 * always expanded, correcting to the stored value right after hydration.
 * While collapsed, the running/completion line still updates live as
 * `status` changes; while resolved, the completion line is intended to
 * persist across reloads (localStorage-backed) — this component does not
 * revert to running.
 *
 * Not spelled out by SPEC.md §3 (left as "component internals," this
 * session's call): whether an *expanded* banner stays visible once its run
 * resolves. It does here — the expanded body swaps its heading to the
 * completion line rather than disappearing, so a visitor watching it live
 * gets to see the outcome instead of the banner vanishing the instant the
 * run finishes.
 */
export function StatusBanner({ status }: { status: RunStatusPayload }) {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  function toggle() {
    setStoredCollapsed(!collapsed);
  }

  const running = status.status === "running";
  const line = running ? BANNER_RUNNING_LINE : bannerCompletionLine(status);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded border border-zinc-300 bg-zinc-50 px-4 py-2 text-left text-sm text-zinc-700"
      >
        <span className="flex items-center gap-2">
          {running && <RunningSpinner />}
          {line}
        </span>
        <span className="shrink-0 text-xs font-medium text-blue-700">
          Déplier
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-zinc-300 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          {running && <RunningSpinner />}
          {line}
        </p>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
        >
          Réduire
        </button>
      </div>
      <p className="text-sm text-zinc-600">{BANNER_PEDAGOGICAL_COPY}</p>
    </div>
  );
}

/**
 * A real scrape can run 30+ LLM/page requests across both sites and take a
 * while (SPEC.md §7 politeness delays) — a static "Recherche en cours…"
 * line alone gave no visible sign of life. Plain CSS via Tailwind's built-in
 * `animate-spin`, no icon library (added 2026-09-11).
 */
function RunningSpinner() {
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600"
    />
  );
}
