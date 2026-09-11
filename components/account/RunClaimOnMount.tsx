"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function RunClaimOnMountInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const claimRunId = searchParams.get("claimRunId");

  useEffect(() => {
    if (!claimRunId) return;
    const runId = claimRunId; // narrow once — TS doesn't carry the guard
    // above into the nested async closure below.
    let cancelled = false;

    async function claim() {
      // Awaited (fixed 2026-09-11): the previous fire-and-forget version
      // navigated immediately, racing the claim itself. Harmless while `/`
      // was the landing page (it doesn't care about run ownership), but
      // `/dashboard` (the new landing target, SPEC.md §3 item 4) does —
      // its zero-runs redirect and run selection both depend on the claim
      // having actually persisted first.
      const res = await fetch("/api/scrape/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      }).catch(() => null);
      // Best-effort on failure (network error, unauthenticated, or an
      // already-claimed no-op) — nothing to surface either way.
      if (cancelled) return;

      const params = new URLSearchParams(searchParams);
      params.delete("claimRunId");
      // On a successful claim, select the just-claimed run explicitly so
      // the landing page shows it instead of the "all time" aggregate
      // (relevant on /dashboard, which may otherwise mix in the visitor's
      // other own runs).
      if (res?.ok) params.set("runId", runId);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }

    claim();
    return () => {
      cancelled = true;
    };
  }, [claimRunId, pathname, router, searchParams]);

  return null;
}

/**
 * Fires the anonymous-run claim (SPEC.md §3 "Claiming an anonymous run" /
 * §9 "Claim endpoint") once per mount: if `?claimRunId=` survived the OAuth
 * redirect round-trip (see `OAuthButtons`'s `callbackURL`), POSTs it to
 * `POST /api/scrape/claim`, awaits it, then replaces the URL — stripping
 * `claimRunId` and, on success, setting `?runId=` to the claimed run so the
 * landing page (now `/dashboard` for a run-carrying sign-in, 2026-09-11)
 * shows it explicitly rather than falling back to whatever it renders with
 * no run selected.
 *
 * Mounted unconditionally on `/` and `/dashboard` — by construction
 * `claimRunId` only ever appears right after a sign-in/sign-up completes, so
 * the caller is authenticated by the time this runs; an unauthenticated hit
 * (someone visiting the URL directly) just gets a harmless 401 from the
 * endpoint. Renders nothing.
 *
 * Wrapped in its own `Suspense` boundary: `useSearchParams` requires one,
 * and isolating it here keeps `/` and `/dashboard` from opting their whole
 * tree out of the server-rendered shell for a component that renders
 * nothing anyway.
 */
export function RunClaimOnMount() {
  return (
    <Suspense fallback={null}>
      <RunClaimOnMountInner />
    </Suspense>
  );
}
