import type { LookbackWindow } from "@/lib/extraction/lookback-window";

// UNVERIFIED — scaffolded 2026-08-28 from prior general knowledge of
// hellowork.com, NOT confirmed by live inspection this session (the domain
// is blocked by the Claude browser extension's permission allowlist). Every
// query-param name and value below is marked TODO(verify) and MUST be
// checked against the live site before the HelloWork scraper is trusted in
// production. The shape the scaffold assumes:
//
// - `k` carries the free-text keywords; `l` carries the location as free
//   text ("Paris").
// - Pagination is a 1-indexed `p` query param on the same results path
//   (HelloWork server-renders the results list — not an infinite scroll).
// - HelloWork exposes a "Date de publication" filter (`d`), but its value
//   vocabulary (day counts? named buckets?) is unconfirmed and it can't
//   express an arbitrary `since_date`, so it is NOT emitted here — lookback
//   filtering is applied entirely post-extraction via isWithinLookbackWindow,
//   consistent with the Apec builder.
const RESULTS_PATH = "https://www.hellowork.com/fr-fr/emploi/recherche.html";

/**
 * Builds a HelloWork search-results URL.
 *
 * `params.page` is 0-indexed (the {@link runSiteScrape} convention, shared
 * with `buildApecSearchUrl`); HelloWork's own `p` param is 1-indexed, so it
 * is emitted as `page + 1` and omitted for the first page.
 *
 * `params.lookback` is accepted for parity with the other site URL builders
 * but has no effect — see the file header on the unconfirmed `d` filter.
 * Lookback filtering happens post-extraction via `isWithinLookbackWindow`.
 *
 * @see the file header — every param name and value here is UNVERIFIED and
 * marked TODO(verify).
 */
export function buildHelloworkSearchUrl(params: {
  keywords: string;
  location?: string | null;
  lookback: LookbackWindow;
  page: number; // 0-indexed (runner convention)
}): string {
  const url = new URL(RESULTS_PATH);
  url.searchParams.set("k", params.keywords); // TODO(verify)
  if (params.location) {
    url.searchParams.set("l", params.location); // TODO(verify)
  }
  if (params.page > 0) {
    // TODO(verify: HelloWork page param is "p", 1-indexed)
    url.searchParams.set("p", String(params.page + 1));
  }
  return url.toString();
}
