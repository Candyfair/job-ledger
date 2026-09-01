"use client";

import { useEffect, useRef, useState } from "react";
import type { RunStatusPayload } from "@/lib/dashboard/derive-run-status";

// Deliberate choice (SPEC.md's brief asked for "3-5s, flag it, don't bury
// it") — middle of that range.
const POLL_INTERVAL_MS = 4000;
// Independent safety cutoff so a client never polls forever even if this
// constant and the server's own STALE_TIMEOUT_MS (see derive-run-status.ts)
// ever drift apart.
const MAX_POLL_DURATION_MS = 12 * 60 * 1000;

/**
 * Polls `GET /api/scrape/status/:runId` only while the run's derived status
 * is `"running"`, stopping the moment a poll resolves to a terminal status
 * or the safety cutoff elapses. Pass `null` for either argument to disable
 * polling entirely (e.g. the authenticated dashboard, which doesn't live-
 * poll its run-history strip — only the anonymous single-run view has that
 * requirement, SPEC.md §3) while still calling the hook unconditionally.
 */
export function useRunStatusPolling(
  runId: string | null,
  initialStatus: RunStatusPayload | null,
): RunStatusPayload | null {
  const [status, setStatus] = useState(initialStatus);
  const elapsedRef = useRef(0);
  const isRunning = status?.status === "running";

  useEffect(() => {
    if (!runId || !isRunning) return;

    const interval = setInterval(() => {
      elapsedRef.current += POLL_INTERVAL_MS;
      if (elapsedRef.current >= MAX_POLL_DURATION_MS) {
        clearInterval(interval);
        return;
      }

      fetch(`/api/scrape/status/${runId}`)
        .then((res) =>
          res.ok ? (res.json() as Promise<RunStatusPayload>) : null,
        )
        .then((next) => {
          if (!next) return;
          setStatus(next);
          if (next.status !== "running") {
            clearInterval(interval);
          }
        })
        .catch(() => {
          // Transient network error — keep polling, next tick retries.
        });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [runId, isRunning]);

  return status;
}
