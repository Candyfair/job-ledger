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

    fetch("/api/scrape/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: claimRunId }),
    }).catch(() => {
      // Best-effort — an unauthenticated or already-claimed call is a
      // harmless no-op server-side; nothing to surface either way.
    });

    // Strip the param regardless of outcome so a reload never re-fires it.
    const params = new URLSearchParams(searchParams);
    params.delete("claimRunId");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [claimRunId, pathname, router, searchParams]);

  return null;
}

/**
 * Fires the anonymous-run claim (SPEC.md §3 "Claiming an anonymous run" /
 * §9 "Claim endpoint") once per mount: if `?claimRunId=` survived the OAuth
 * redirect round-trip (see `OAuthButtons`'s `callbackURL`), POSTs it to
 * `POST /api/scrape/claim` and strips the param from the URL.
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
