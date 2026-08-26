// THROWAWAY PRE-SESSION-4 SPIKE — proves the Trigger.dev / SiteStatus write
// path end to end. Not the real multi-site Apec.fr implementation.

import type { LookbackWindow } from "@/lib/extraction/lookback-window";

// Confirmed via live inspection on 2026-08-26 (apec.fr):
// - `motsCles`/`lieux` are the keyword/location params, both free text (same
//   shape as Indeed's `q`/`l` — `lieux=Paris` returns results same as a
//   department code would).
// - Pagination is a plain `page` query param, 0-indexed, honored via direct
//   URL navigation (no client-side-only Angular routing) — confirmed against
//   both a middle page and the true last page.
// - Apec shows 20 results per page (not 10 like Indeed).
// - No `fromage`-equivalent "posted since" param was found during this
//   inspection pass — lookback filtering relies entirely on the same
//   post-extraction date filter Indeed uses (lib/extraction/lookback-window.ts).
//
// TODO(Session 4): SPEC.md §2 requires the "partner sites" checkbox to stay
// unchecked. On Apec this isn't a simple boolean flag — unchecking it in the
// browser adds four repeated `typesConvention` params (observed:
// 143684/143685/143686/143687) with no visible label in the markup. Those
// IDs couldn't be verified against any official documentation in this spike,
// so partner-site exclusion is intentionally NOT implemented here — partner
// listings will leak into results. Must be researched properly before this
// becomes the real Apec.fr implementation.

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
