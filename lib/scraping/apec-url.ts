// THROWAWAY PRE-SESSION-4 SPIKE — proves the Trigger.dev / SiteStatus write
// path end to end. Not the real multi-site Apec.fr implementation.

import type { LookbackWindow } from "@/lib/extraction/lookback-window";

// Confirmed via live inspection on 2026-08-26 (apec.fr):
// - `motsCles`/`lieux` are the keyword/location params, both free text —
//   `lieux=Paris` returns results same as a department code would.
// - Pagination is a plain `page` query param, 0-indexed, honored via direct
//   URL navigation (no client-side-only Angular routing) — confirmed against
//   both a middle page and the true last page.
// - Apec shows 20 results per page.
// - No "posted since" query param was found during this inspection pass —
//   lookback filtering relies entirely on the shared post-extraction date
//   filter (lib/extraction/lookback-window.ts).
//
// TODO(Session 4): SPEC.md §2 requires the "partner sites" checkbox to stay
// unchecked. On Apec this isn't a simple boolean flag — unchecking it in the
// browser adds four repeated `typesConvention` params (observed:
// 143684/143685/143686/143687) with no visible label in the markup. Those
// IDs couldn't be verified against any official documentation in this spike,
// so partner-site exclusion is intentionally NOT implemented here — partner
// listings will leak into results. Must be researched properly before this
// becomes the real Apec.fr implementation.

/**
 * Builds an Apec.fr search-results URL. No "posted since" query param was
 * found during live inspection (see the file header) — `params.lookback` is
 * accepted for signature parity with other site scrapers but has no effect
 * here; lookback filtering for Apec relies entirely on
 * `isWithinLookbackWindow` post-extraction.
 */
export function buildApecSearchUrl(params: {
  keywords: string;
  location?: string | null;
  lookback: LookbackWindow;
  page: number; // 0-indexed
}): string {
  const url = new URL(
    "https://www.apec.fr/candidat/recherche-emploi.html/emploi",
  );
  url.searchParams.set("motsCles", params.keywords);
  if (params.location) {
    url.searchParams.set("lieux", params.location);
  }
  if (params.page > 0) {
    url.searchParams.set("page", String(params.page));
  }
  return url.toString();
}
