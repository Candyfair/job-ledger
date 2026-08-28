import type { LookbackWindow } from "@/lib/extraction/lookback-window";

// HelloWork search query params — verified 2026-08-28 via manual DevTools
// inspection of the live search (network request payloads only; the Claude
// browser extension still can't reach hellowork.com).
//
// - k   = free-text keywords (form-url-encoded, spaces as "+")
// - l   = location as a free-text "City PostalCode" string, not a structured id
// - st  = sort order; "relevance" is HelloWork's default and the only option
//         (no date-sort alternative exists — don't invent one)
// - ray = search radius around `l`, in km (HelloWork's default is 20)
// - msa = minimum annual salary filter, in € (e.g. 30000 = €30k/yr). No
//         JobConfig field maps to a salary floor, so this stays pinned at 0
//         (no minimum).
// - d   = "Date de publication" filter — see HELLOWORK_DATE_FILTER below
// - p   = page number, 1-indexed
//
// NOT emitted: k_autocomplete / l_autocomplete are internal
// autocomplete-suggestion resource ids, not derivable from an arbitrary
// JobConfig — free-text k / l only.
//
// The DOM-layer selectors in hellowork-scraper.ts are still UNVERIFIED (no
// markup was inspected this round) — that file keeps its TODO(verify) markers.
const RESULTS_PATH = "https://www.hellowork.com/fr-fr/emploi/recherche.html";

// Pinned search-filter params — set explicitly so a change to HelloWork's
// defaults can't silently alter what we scrape.
const HELLOWORK_SORT = "relevance"; // `st`
const HELLOWORK_RADIUS_KM = 20; // `ray`
const HELLOWORK_MIN_ANNUAL_SALARY = 0; // `msa` — 0 = no minimum

// Values for the `d` ("Date de publication") filter, confirmed 2026-08-28.
//
// NAMING COLLISION — read before touching: the query-param KEY is `d`, and
// one of its own VALUES is also the string `"d"` (3-day bucket, probably
// short for "jours"). The two are unrelated. These named constants exist
// precisely so `d=d` is never read as a typo or a bug in the code below.
const HELLOWORK_DATE_FILTER = {
  LAST_24H: "h",
  LAST_3_DAYS: "d",
  LAST_WEEK: "w", // confirmed but unused — no matching LookbackWindow
  LAST_MONTH: "m", // confirmed but unused — no matching LookbackWindow
  ALL: "all",
} as const;

/**
 * Maps the app's {@link LookbackWindow} onto HelloWork's `d` filter value.
 *
 * `since_date` has no matching HelloWork bucket, so the server-side filter
 * is disabled (`all`) and the post-extraction `isWithinLookbackWindow` in
 * `runSiteScrape` does the cut — the same posture as Apec, which has no
 * date param at all. Deliberately NOT approximated with `w` / `m`.
 */
function helloworkDateFilter(lookback: LookbackWindow): string {
  switch (lookback.type) {
    case "24h":
      return HELLOWORK_DATE_FILTER.LAST_24H;
    case "3d":
      return HELLOWORK_DATE_FILTER.LAST_3_DAYS;
    case "since_date":
      return HELLOWORK_DATE_FILTER.ALL;
  }
}

/**
 * Builds a HelloWork search-results URL.
 *
 * `params.page` is 0-indexed (the {@link runSiteScrape} convention, shared
 * with `buildApecSearchUrl`); HelloWork's own `p` param is 1-indexed, so it
 * is emitted as `page + 1` and omitted for the first page.
 *
 * `params.lookback` maps to the `d` filter: `24h` → `d=h`, `3d` → `d=d`,
 * `since_date` → `d=all` (see {@link helloworkDateFilter}). The
 * post-extraction `isWithinLookbackWindow` filter in `runSiteScrape` stays
 * authoritative in every case — including the pre-filtered `24h` / `3d`
 * ones — as a correctness backstop.
 *
 * `st` / `ray` / `msa` are pinned (see the constants above); `k` / `l` are
 * free text.
 */
export function buildHelloworkSearchUrl(params: {
  keywords: string;
  location?: string | null;
  lookback: LookbackWindow;
  page: number; // 0-indexed (runner convention)
}): string {
  const url = new URL(RESULTS_PATH);
  url.searchParams.set("k", params.keywords);
  if (params.location) {
    url.searchParams.set("l", params.location);
  }
  url.searchParams.set("st", HELLOWORK_SORT);
  url.searchParams.set("ray", String(HELLOWORK_RADIUS_KM));
  url.searchParams.set("msa", String(HELLOWORK_MIN_ANNUAL_SALARY));
  url.searchParams.set("d", helloworkDateFilter(params.lookback));
  if (params.page > 0) {
    url.searchParams.set("p", String(params.page + 1));
  }
  return url.toString();
}
