import type { Page } from "playwright";
import { buildHelloworkSearchUrl } from "./hellowork-url";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";
import type { CapturedSiteListing } from "./run-scrape";
import {
  ScrapeBlockedError,
  ScrapeMarkupError,
  isBotChallengePage,
} from "./errors";

/**
 * Result of capturing one HelloWork results page. `hasMore` reflects whether
 * HelloWork's pager exposes a button for the next page, not whether the
 * volume cap is reached — that's {@link runSiteScrape}'s concern.
 */
export interface HelloworkPageResult {
  listings: CapturedSiteListing[];
  hasMore: boolean;
}

// Selectors verified 2026-08-28 via manual DevTools inspection of the live
// hellowork.com search results (the Claude browser extension still can't
// reach the domain). HelloWork server-renders the results list, so the
// cards and the result-count heading are present in the initial HTML — no
// client-render wait is needed the way Apec's Angular SPA requires one.

// The repeating results-list item.
const LISTING_CARD_SELECTOR = 'li[data-id-storage-target="item"]';
// The job-detail anchor inside a card. HelloWork detail URLs look like
// /fr-fr/emplois/<id>.html (e.g. /fr-fr/emplois/80722424.html).
const LISTING_LINK_SELECTOR = 'a[href*="/emplois/"]';
// Cookie-consent. Real <button id="hw-cc-notice-continue-without-accepting-btn">
// "Continuer sans accepter"</button>. Select on the stable id only — the
// surrounding Tailwind utility classes churn on redesigns.
const COOKIE_REFUSE_SELECTOR = "#hw-cc-notice-continue-without-accepting-btn";
// The results-count heading. Normally shows the total ("55 offres"); reads
// "0 offre" (singular) when a search has no matches — see readResultCount for
// why this, and not a fixed "no results" string, is how emptiness is
// detected (the assumed "Aucune offre" copy does not exist on the page).
const COUNT_HEADING_SELECTOR = "h1";
// Leading integer of the count heading. Tolerates thousands grouping
// (spaces / non-breaking spaces) before the "offre(s)" token.
const RESULT_COUNT_RE = /(\d[\d\s]*)\s*offres?\b/i;

/**
 * Dismisses the "Continuer sans accepter" cookie-consent banner if present.
 * Bounded wait, non-fatal if the banner never appears (consent already
 * recorded on a repeat visit, or no banner served) — mirrors Apec's
 * `dismissCookieConsent`.
 */
async function dismissCookieConsent(page: Page): Promise<void> {
  const refuseButton = page.locator(COOKIE_REFUSE_SELECTOR);
  await refuseButton
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  if (await refuseButton.count()) {
    await refuseButton.click().catch(() => {});
  }
}

/**
 * Reads the total result count off HelloWork's `<h1>` results heading.
 *
 * HelloWork has no fixed "no results" message — the initially-assumed
 * "Aucune offre" copy does not exist. Instead the same heading that shows
 * "55 offres" for a populated search shows "0 offre" (singular) for an
 * empty one, so emptiness is a parsed `0`, not a matched string.
 *
 * Returns the parsed integer, or `null` when no `<h1>` on the page matches
 * the count pattern at all — which the caller treats as a markup change
 * (the heading moved or was restructured), not an empty result.
 */
async function readResultCount(page: Page): Promise<number | null> {
  // Server-rendered, so normally already attached; the bounded wait just
  // covers a slow initial paint.
  await page
    .locator(COUNT_HEADING_SELECTOR)
    .first()
    .waitFor({ state: "attached", timeout: 15000 })
    .catch(() => {});

  const headings = await page.locator(COUNT_HEADING_SELECTOR).allInnerTexts();
  for (const text of headings) {
    const match = text.match(RESULT_COUNT_RE);
    if (match) {
      return Number.parseInt(match[1].replace(/\D/g, ""), 10);
    }
  }
  return null;
}

/**
 * Navigates to and captures one page of HelloWork search results.
 *
 * Same contract as `captureApecPage`: dismiss cookie consent, check for a
 * bot-verification interstitial, then read one raw text blob + the detail
 * href per card (Playwright captures, Claude structures — CLAUDE.md
 * decision #1).
 *
 * Empty results vs. markup change: HelloWork's `<h1>` count heading is the
 * source of truth. A parsed `0` is a legitimate empty result and returns
 * `{ listings: [], hasMore: false }`. A heading that can't be found or
 * parsed, or a non-zero count with no matching cards, is a markup change →
 * {@link ScrapeMarkupError}.
 *
 * Pagination: HelloWork's pager is a set of `<button type="submit" name="p"
 * value="N" form="searchForm">` elements, one per page — not links. This
 * function never clicks them; each page is fetched by rebuilding the URL
 * with {@link buildHelloworkSearchUrl} (the button just submits that same
 * `p=N` change through Turbo, so a direct navigation is equivalent and
 * avoids an unnecessary DOM interaction). `hasMore` is therefore detected
 * structurally: does a button for the *next* HelloWork page number exist in
 * the pager? The `name`/`value` attributes are the stable part — the arrow
 * icon and Tailwind classes are not.
 *
 * Throws — never retried or worked around (SPEC.md §2, §5):
 * - {@link ScrapeBlockedError} on a recognized bot-challenge interstitial;
 * - {@link ScrapeMarkupError} on an unrecognized page shape (see above).
 */
export async function captureHelloworkPage(
  page: Page,
  params: {
    keywords: string;
    location?: string | null;
    lookback: LookbackWindow;
    page: number; // 0-indexed (runner convention)
  },
): Promise<HelloworkPageResult> {
  const url = buildHelloworkSearchUrl(params);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  if (isBotChallengePage(await page.locator("body").innerText())) {
    throw new ScrapeBlockedError(
      "HelloWork served a bot-verification page instead of search results",
    );
  }

  await dismissCookieConsent(page);

  const resultCount = await readResultCount(page);
  if (resultCount === null) {
    throw new ScrapeMarkupError(
      "HelloWork results-count heading not found — page structure changed",
    );
  }
  if (resultCount === 0) {
    return { listings: [], hasMore: false };
  }

  const cardCount = await page.locator(LISTING_CARD_SELECTOR).count();
  if (cardCount === 0) {
    throw new ScrapeMarkupError(
      `HelloWork reported ${resultCount} result(s) but no cards matched ${LISTING_CARD_SELECTOR}`,
    );
  }

  const rawCards = await page.locator(LISTING_CARD_SELECTOR).evaluateAll(
    (cards, linkSelector) =>
      cards.map((card) => {
        const anchor = card.querySelector(linkSelector);
        return {
          href: anchor?.getAttribute("href") ?? null,
          rawText: (card as HTMLElement).innerText ?? "",
        };
      }),
    LISTING_LINK_SELECTOR,
  );

  if (rawCards.every((card) => !card.href)) {
    // Cards were counted but not one held a job-detail anchor — an
    // unexpected page shape, not a "genuinely zero results" case.
    throw new ScrapeMarkupError(
      "HelloWork listing cards found but the job-link structure did not match",
    );
  }

  const listings: CapturedSiteListing[] = [];
  rawCards.forEach((card, index) => {
    if (!card.href) {
      console.warn(`Listing at index ${index} has no href — dropping`);
      return;
    }
    listings.push({
      listingId: `l${params.page}_${index}`,
      url: new URL(card.href, url).toString(),
      rawText: card.rawText,
    });
  });

  // params.page is 0-indexed; HelloWork's page number is params.page + 1, so
  // the next page's submit button carries value params.page + 2.
  const nextPageValue = params.page + 2;
  const hasMore =
    (await page.locator(`button[name="p"][value="${nextPageValue}"]`).count()) >
    0;

  return { listings, hasMore };
}
