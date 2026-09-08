import { isWithinLookbackWindow } from "@/lib/extraction/lookback-window";
import { getExtractionAdapter } from "@/lib/extraction/adapter-registry";
import type {
  ExtractionAdapter,
  RoleCanonicalizer,
} from "@/lib/extraction/adapter";
import { normalizeCompany } from "@/lib/dedup/normalize-company";
import { sleep, randomDelayMs } from "./politeness";
import {
  resolveScrapeContext,
  finalizeScrapeRun,
  VOLUME_CAP,
  type ScrapeSitePayload,
  type CollectedListing,
  type RunSiteScrapeResult,
} from "./run-scrape";
import { fetchApecResultsPage } from "./apec-api";
import { resolveApecLocation } from "./apec-location";
import { markSiteFailed } from "./site-status";
import { describeScrapeError } from "./errors";

/**
 * Belt-and-suspenders ceiling on page fetches — a guard against a
 * malformed / missing `totalCount` (a garbage number, or the field
 * vanishing), NOT the primary termination signal. `totalCount` itself
 * bounds the loop in the normal case. 5 pages × 50 (`APEC_PAGE_SIZE`) = 250
 * rows scanned, 5× {@link VOLUME_CAP}; a run this large means the lookback
 * window is dropping almost everything, which is a data problem, not a
 * pagination one.
 */
const MAX_APEC_PAGES = 5;

interface RunApecApiScrapeOptions {
  site: "apec";
  payload: ScrapeSitePayload;
  /** Defaults to the adapter resolved from `payload.model`; injectable for
   * tests. Only {@link RoleCanonicalizer} is used — Apec listings arrive
   * structured, so `extractListings` is never called on this path. */
  extractionAdapter?: ExtractionAdapter & RoleCanonicalizer;
  /** Injectable for tests; defaults to the real HTTP fetcher. */
  fetchPage?: typeof fetchApecResultsPage;
}

/**
 * The Apec scrape runner — the browserless, LLM-free-for-extraction sibling
 * of {@link runSiteScrape}. Apec's own search web-service
 * ({@link fetchApecResultsPage}) returns structured per-listing JSON, so
 * this path has no Playwright, no `buildDelimitedContent`, and no
 * `adapter.extractListings`. The one LLM call is a single batched
 * `canonicalizeRoles` for the SPEC.md §5 cross-site dedup signal.
 *
 * Shares the pre-scrape work ({@link resolveScrapeContext} — kill switch,
 * payload validation, config resolution, lookback coercion) and the
 * persistence tail ({@link finalizeScrapeRun} — `ScrapeRun` create-or-reuse,
 * `Listing` insert with `excludedByKeyword` tagging) with the HelloWork
 * path.
 *
 * Location — three states:
 * - no location supplied → nationwide search, `lieux` omitted (a legitimate
 *   path, SPEC.md §3);
 * - location resolves ({@link resolveApecLocation}) → scoped by `lieuId`;
 * - location supplied but unresolvable → **Apec is skipped for this run**:
 *   no fetch, no `Listing` insert, no `markSiteFailed`. The run is
 *   downgraded to `partial_failure` (same soft signal as an empty
 *   extraction) with an operator-facing French `note`.
 *
 * Termination: `totalCount` from the first response is the sole real bound —
 * the loop stops once every page up to `totalCount` has been fetched or
 * {@link VOLUME_CAP} in-window listings are collected. {@link MAX_APEC_PAGES}
 * is a guard against a bad `totalCount`, nothing more.
 *
 * Side effects:
 * - `SiteStatus` (upsert, via `markSiteFailed`): only when
 *   {@link fetchApecResultsPage} throws — a `ScrapeBlockedError`
 *   (`bot_challenge`) or anything else, including a Zod response-shape
 *   failure (`markup_broken`). Re-thrown so Trigger.dev marks the attempt
 *   failed. A wholesale `canonicalizeRoles` failure is NOT a site failure —
 *   it degrades `roleCanonical` to `null` and downgrades the run to
 *   `partial_failure`, listings still persist.
 * - `ScrapeRun` / `Listing`: via {@link finalizeScrapeRun}.
 */
export async function runApecApiScrape({
  site,
  payload,
  extractionAdapter,
  fetchPage = fetchApecResultsPage,
}: RunApecApiScrapeOptions): Promise<RunSiteScrapeResult> {
  const resolution = await resolveScrapeContext(site, payload);
  if ("killSwitchSkip" in resolution) {
    return resolution.killSwitchSkip;
  }
  const context = resolution.context;

  // Location, three states (see the doc comment).
  let lieux: string[] | undefined;
  if (context.location && context.location.trim() !== "") {
    const located = await resolveApecLocation(context.location);
    if (located.code === null) {
      return finalizeScrapeRun({
        site,
        payload,
        context,
        collected: [],
        anyPageExtractionFailed: true,
        note: `Localisation « ${context.location} » non reconnue par Apec — recherche Apec ignorée pour ce run.`,
      });
    }
    lieux = [located.code];
  }

  const adapter =
    extractionAdapter ?? getExtractionAdapter(payload.model ?? "claude_haiku");

  const collected: CollectedListing[] = [];
  let anyPageExtractionFailed = false;

  try {
    let pageNum = 0;
    let fetched = 0;
    let totalCount = Infinity;

    while (
      collected.length < VOLUME_CAP &&
      fetched < totalCount &&
      pageNum < MAX_APEC_PAGES
    ) {
      if (pageNum > 0) {
        await sleep(randomDelayMs());
      }

      const page = await fetchPage({
        searchTerm: context.searchTerm,
        lieux,
        page: pageNum,
      });
      totalCount = page.totalCount;
      fetched += page.listings.length;

      if (page.listings.length === 0) break;

      for (const listing of page.listings) {
        if (!isWithinLookbackWindow(listing.datePosted, context.lookback)) {
          continue;
        }
        collected.push({
          title: listing.title,
          company: listing.company,
          companyNormalized: listing.company
            ? normalizeCompany(listing.company)
            : null,
          roleCanonical: null,
          datePosted: listing.datePosted,
          salaryRaw: listing.salaryRaw,
          url: listing.url,
        });
        if (collected.length >= VOLUME_CAP) break;
      }

      pageNum += 1;
    }
  } catch (error) {
    const { cause, note } = describeScrapeError(error, site);
    await markSiteFailed(site, cause, note);
    throw error;
  }

  // Single batched role-canonicalization call for the whole run (SPEC.md §5
  // dedup signal). Never throws; an all-null return is a soft signal.
  if (collected.length > 0) {
    const roles = await adapter.canonicalizeRoles(
      collected.map((c) => c.title),
    );
    collected.forEach((c, i) => {
      c.roleCanonical = roles[i] ?? null;
    });
    if (roles.every((r) => r === null)) {
      anyPageExtractionFailed = true;
    }
  }

  return finalizeScrapeRun({
    site,
    payload,
    context,
    collected,
    anyPageExtractionFailed,
  });
}
