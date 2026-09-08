import { z } from "zod";
import {
  ScrapeBlockedError,
  ScrapeMarkupError,
  isBotChallengePage,
} from "./errors";
import { SCRAPER_USER_AGENT } from "./politeness";

/**
 * Apec.fr's own (undocumented) search web-service. The apec.fr results page
 * is an Angular SPA that renders these same objects client-side; calling the
 * service directly skips Playwright and the LLM listing-extraction step for
 * Apec entirely (SPEC.md §4 — "Claude structures HelloWork; Apec arrives
 * pre-structured"). Pinned like the DOM selectors it replaces: re-verify
 * against a live capture if {@link ApecSearchResponseSchema} starts
 * rejecting responses.
 *
 * Verified live 2026-09-08: a plain cookieless POST (User-Agent + JSON
 * content-type, no Referer/Origin/CSRF/session cookie) returns the full
 * structured result set. Whether repeated cookieless POSTs eventually draw a
 * 403/429/challenge is *not* stress-tested here — it is observed during the
 * `npm run test:scrape:apec` verification pass (a non-200 or a challenge
 * body surfaces as {@link ScrapeBlockedError} / {@link ScrapeMarkupError}
 * below, which flips `SiteStatus` the same way a selector timeout used to).
 */
export const APEC_SEARCH_ENDPOINT =
  "https://www.apec.fr/cms/webservices/rechercheOffre";

/**
 * Base URL of an Apec offer detail page. `{numeroOffre}` (the `numeroOffre`
 * field on each result object) is appended verbatim — verified live
 * 2026-09-08 that no other query params are needed for the page to resolve.
 */
export const APEC_OFFER_URL_BASE =
  "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/";

/**
 * SPEC.md §2 — Apec's "sites partenaires" (partner sites) must stay
 * excluded: their listings overlap HelloWork and are low-relevance
 * otherwise. Verified live on apec.fr (originally 2026-08-28, re-confirmed
 * 2026-09-08): sending exactly these four `typesConvention` values is the
 * partner-sites-excluded state. Apec's own UI toggles a fifth value, 143706
 * (the partner-listings type), when the "sites partenaires" checkbox is
 * ticked — and that checkbox is ticked by default in at least some sessions,
 * so we pin the four-value set explicitly rather than trusting a default.
 * We never emit 143706.
 */
export const OWN_OFFERS_TYPES_CONVENTION = [
  "143684",
  "143685",
  "143686",
  "143687",
] as const;

/** Server-honored page size (verified live 2026-09-08: a `range` of 50
 * returns exactly 50 objects in `resultats`). Equal to `VOLUME_CAP`, so one
 * request covers a whole run when `totalCount <= 50`. */
export const APEC_PAGE_SIZE = 50;

/**
 * Builds the `rechercheOffre` POST body.
 *
 * - `motsCles` — the search term, sent as-is (the service percent-decodes).
 * - `lieux` — Apec `lieuId` values (NOT INSEE citycodes: verified live
 *   2026-09-08 with two divergent examples — Paris 01 `lieuId 590711` vs
 *   citycode `"75101"`, Lyon 01 `lieuId 588617` vs citycode `"69381"`; the
 *   payload carried the `lieuId` both times). Omitted entirely for a
 *   nationwide search — see {@link resolveApecLocation}.
 * - `sorts` — `DATE`/`DESCENDING` for newest-first. Result-quality only:
 *   termination is driven by `totalCount`, not by the sort order.
 * - `pagination.startIndex` / `pagination.range` — 0-based offset and page
 *   size.
 *
 * @param params.page 0-indexed page number (runner convention). Converted to
 *   `startIndex = page * APEC_PAGE_SIZE`.
 */
export function buildApecSearchBody(params: {
  searchTerm: string;
  lieux?: string[];
  page: number;
}): Record<string, unknown> {
  return {
    motsCles: params.searchTerm,
    typesConvention: [...OWN_OFFERS_TYPES_CONVENTION],
    sorts: [{ type: "DATE", direction: "DESCENDING" }],
    pagination: {
      startIndex: params.page * APEC_PAGE_SIZE,
      range: APEC_PAGE_SIZE,
    },
    ...(params.lieux && params.lieux.length > 0 ? { lieux: params.lieux } : {}),
  };
}

/**
 * One raw result object off `rechercheOffre`. Only the fields the mapper
 * uses are declared; `.passthrough()` keeps the rest so an added field never
 * fails a response — the schema is a drift *tripwire* for fields that
 * disappear or change type, not a strict allowlist.
 */
const ApecResultSchema = z
  .object({
    numeroOffre: z.string(),
    intitule: z.string(),
    nomCommercial: z.string().nullish(),
    salaireTexte: z.string().nullish(),
    datePublication: z.string().nullish(),
    lieuTexte: z.string().nullish(),
  })
  .passthrough();

/**
 * Shape of a `rechercheOffre` response. A parse failure here is treated as
 * "Apec changed the service" — {@link ScrapeMarkupError} → `markup_broken`
 * on `SiteStatus`, the role the selector timeouts played on the Playwright
 * path.
 */
export const ApecSearchResponseSchema = z
  .object({
    totalCount: z.number(),
    resultats: z.array(ApecResultSchema),
  })
  .passthrough();

export type ApecSearchResponse = z.infer<typeof ApecSearchResponseSchema>;

/**
 * A single Apec listing after mapping from the raw JSON — the site-specific
 * fields only. `companyNormalized` (deterministic) and `roleCanonical`
 * (batched LLM call) are added by the runner, not here.
 */
export interface ApecMappedListing {
  title: string;
  company: string | null;
  salaryRaw: string | null;
  datePosted: string | null;
  url: string;
}

/** Builds the detail-page URL for an offer id. */
export function buildApecOfferUrl(numeroOffre: string): string {
  return `${APEC_OFFER_URL_BASE}${numeroOffre}`;
}

function mapResult(raw: z.infer<typeof ApecResultSchema>): ApecMappedListing {
  const company = raw.nomCommercial?.trim();
  return {
    title: raw.intitule,
    // Anonymous employers come back absent / blank on this field.
    company: company ? company : null,
    salaryRaw: raw.salaireTexte?.trim() ? raw.salaireTexte.trim() : null,
    datePosted: raw.datePublication?.trim() ? raw.datePublication.trim() : null,
    url: buildApecOfferUrl(raw.numeroOffre),
  };
}

/**
 * Fetches and maps one page of Apec search results.
 *
 * Failure handling — mirrors the Playwright path's error taxonomy so
 * {@link describeScrapeError} classifies both the same way:
 * - a response whose body reads as a bot-verification page, or an outright
 *   401/403 → {@link ScrapeBlockedError} (`bot_challenge`);
 * - any other non-2xx, a non-JSON body, or a body that fails
 *   {@link ApecSearchResponseSchema} → {@link ScrapeMarkupError}
 *   (`markup_broken`).
 *
 * @param fetchImpl injectable for tests; defaults to global `fetch`.
 */
export async function fetchApecResultsPage(
  params: { searchTerm: string; lieux?: string[]; page: number },
  fetchImpl: typeof fetch = fetch,
): Promise<{ listings: ApecMappedListing[]; totalCount: number }> {
  const response = await fetchImpl(APEC_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": SCRAPER_USER_AGENT,
      accept: "application/json",
    },
    body: JSON.stringify(buildApecSearchBody(params)),
  });

  const bodyText = await response.text();

  if (response.status === 401 || response.status === 403) {
    throw new ScrapeBlockedError(
      `Apec search service returned ${response.status} for a cookieless POST`,
    );
  }
  if (isBotChallengePage(bodyText)) {
    throw new ScrapeBlockedError(
      "Apec search service returned a bot-verification page instead of results",
    );
  }
  if (!response.ok) {
    throw new ScrapeMarkupError(
      `Apec search service returned HTTP ${response.status}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new ScrapeMarkupError("Apec search service returned a non-JSON body");
  }

  const parsed = ApecSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ScrapeMarkupError(
      `Apec search response did not match the expected shape: ${parsed.error.message}`,
    );
  }

  return {
    listings: parsed.data.resultats.map(mapResult),
    totalCount: parsed.data.totalCount,
  };
}
