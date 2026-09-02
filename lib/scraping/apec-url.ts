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

// SPEC.md §2 — Apec's "partner sites" ("sites partenaires") checkbox must
// stay unchecked (its results overlap HelloWork and are low-relevance
// otherwise). Verified live on apec.fr (2026-08-28, DevTools): these four
// `typesConvention` params are ALWAYS sent and are exactly the
// partner-sites-EXCLUDED state — the state SPEC §2 wants. Apec's own UI adds
// a fifth value, 143706 (the partner-listings type), on top of these four
// only when the checkbox is ticked; we intentionally never emit it, so the
// default output here already excludes partner sites.
const OWN_OFFERS_TYPES_CONVENTION = ["143684", "143685", "143686", "143687"];

/**
 * Builds an Apec.fr search-results URL.
 *
 * `params.lookback` is accepted for signature parity with the other site URL
 * builders but has no effect — no "posted since" query param exists on Apec
 * (see the file header); lookback filtering happens post-extraction via
 * `isWithinLookbackWindow`.
 *
 * Always pins the four `typesConvention` params that exclude partner-site
 * listings (SPEC.md §2) — see the comment on
 * {@link OWN_OFFERS_TYPES_CONVENTION}.
 */
export function buildApecSearchUrl(params: {
  searchTerm: string;
  location?: string | null;
  lookback: LookbackWindow;
  page: number; // 0-indexed
}): string {
  const url = new URL(
    "https://www.apec.fr/candidat/recherche-emploi.html/emploi",
  );
  url.searchParams.set("motsCles", params.searchTerm);
  if (params.location) {
    url.searchParams.set("lieux", params.location);
  }
  if (params.page > 0) {
    url.searchParams.set("page", String(params.page));
  }
  for (const id of OWN_OFFERS_TYPES_CONVENTION) {
    url.searchParams.append("typesConvention", id);
  }
  return url.toString();
}
