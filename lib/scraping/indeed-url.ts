import type { LookbackWindow } from "@/lib/extraction/lookback-window";

// Confirmed via live inspection on 2026-08-25 (fr.indeed.com):
// - `q`/`l` are the standard keyword/location params.
// - `fromage` maps to days-since-posted (1 = 24h, 3 = 3 days).
// - Pagination increments `start` by 10 per page (confirmed via the site's
//   own pagination nav links: start=10, start=20, start=30, start=40).
// - `sort=date` was NOT reliably honored — sponsored listings stayed pinned
//   at the top regardless — so it is never applied here. The "since a date"
//   lookback case can't use an early-stop heuristic on sort order; it must
//   paginate to the volume cap and filter post-extraction instead (see
//   lib/extraction/lookback-window.ts).
const RESULTS_PER_PAGE = 10;

/**
 * Builds an fr.indeed.com search-results URL. `fromage` (days-since-posted)
 * is set for the `24h`/`3d` lookback cases only — `since_date` intentionally
 * omits it, since `sort=date` was found unreliable (sponsored listings stay
 * pinned regardless), so that case paginates to the volume cap and relies on
 * `isWithinLookbackWindow` to filter post-extraction instead.
 */
export function buildIndeedSearchUrl(params: {
  keywords: string;
  location?: string | null;
  lookback: LookbackWindow;
  page: number; // 0-indexed
}): string {
  const url = new URL("https://fr.indeed.com/emplois");
  url.searchParams.set("q", params.keywords);
  if (params.location) {
    url.searchParams.set("l", params.location);
  }
  if (params.lookback.type === "24h") {
    url.searchParams.set("fromage", "1");
  } else if (params.lookback.type === "3d") {
    url.searchParams.set("fromage", "3");
  }
  // "since_date" intentionally omits fromage — filtered post-extraction.
  if (params.page > 0) {
    url.searchParams.set("start", String(params.page * RESULTS_PER_PAGE));
  }
  return url.toString();
}
