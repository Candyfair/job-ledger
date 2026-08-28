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
 * a "next page" control is present, not whether the volume cap is reached —
 * that's {@link runSiteScrape}'s concern.
 */
export interface HelloworkPageResult {
  listings: CapturedSiteListing[];
  hasMore: boolean;
}

// UNVERIFIED — scaffolded 2026-08-28 from prior general knowledge, NOT
// confirmed by live inspection this session (hellowork.com is blocked by
// the Claude browser extension's permission allowlist). Every selector
// below is a best guess and marked TODO(verify); they MUST be checked
// against the live DOM before this scraper is trusted. HelloWork
// server-renders its results list, so unlike Apec the cards should be
// present at `domcontentloaded` — the wait-for-render race is kept anyway
// as a cheap guard and to keep the shape identical to the other scrapers.

// The repeating results-list item.
const LISTING_CARD_SELECTOR = 'li[data-id-storage-target="item"]'; // TODO(verify)
// The job-detail anchor inside each card. HelloWork detail URLs look like
// /fr-fr/emplois/<id>.html.
const RESULT_LINK_SELECTOR = `${LISTING_CARD_SELECTOR} a[href*="/emplois/"]`; // TODO(verify)
// "Next page" control in the pager at the foot of the list.
const NEXT_PAGE_SELECTOR = 'a[aria-label="Page suivante"], nav a[rel="next"]'; // TODO(verify)
// Cookie-consent. HelloWork has used a "continuer sans accepter" affordance;
// the selector needs confirming.
const COOKIE_REFUSE_SELECTOR =
  "#hw-cc-notice-continue-without-accepting, #onetrust-reject-all-handler"; // TODO(verify)
// Text shown instead of any cards when a search genuinely has zero matches.
const NO_RESULTS_TEXT = "Aucune offre"; // TODO(verify)

/**
 * Dismisses the cookie-consent banner if present. Bounded wait, non-fatal if
 * the banner never appears (consent already recorded, or the selector is
 * wrong — see the TODO on {@link COOKIE_REFUSE_SELECTOR}).
 */
async function dismissCookieConsent(page: Page): Promise<void> {
  const refuseButton = page.locator(COOKIE_REFUSE_SELECTOR).first();
  await refuseButton
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  if (await refuseButton.count()) {
    await refuseButton.click().catch(() => {});
  }
}

/**
 * Waits for HelloWork's results to exist in the DOM. Races a listing card
 * against the "no results" text, whichever appears first; if neither shows
 * up within the timeout the caller treats the page shape as unrecognized (a
 * layout change) and throws {@link ScrapeMarkupError}.
 */
async function waitForResultsToRender(page: Page): Promise<void> {
  await Promise.race([
    page.locator(LISTING_CARD_SELECTOR).first().waitFor({
      state: "attached",
      timeout: 15000,
    }),
    page.getByText(NO_RESULTS_TEXT).first().waitFor({
      state: "visible",
      timeout: 15000,
    }),
  ]);
}

/**
 * Navigates to and captures one page of HelloWork search results. Same shape
 * as `captureApecPage`: dismiss cookie consent, check for a bot-verification
 * interstitial, wait for the results list, read one raw text blob + the
 * detail href per card (Playwright captures, Claude structures — CLAUDE.md
 * decision #1).
 *
 * Throws — never retried or worked around (SPEC.md §2, §5):
 * - {@link ScrapeBlockedError} on a recognized bot-challenge interstitial;
 * - {@link ScrapeMarkupError} when results never render, or cards are
 *   counted but the anchor structure doesn't match.
 *
 * @see the file header — all selectors are UNVERIFIED (TODO(verify)).
 */
export async function captureHelloworkPage(
  page: Page,
  params: {
    keywords: string;
    location?: string | null;
    lookback: LookbackWindow;
    page: number;
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

  try {
    await waitForResultsToRender(page);
  } catch {
    throw new ScrapeMarkupError(
      "HelloWork page did not render listings or a no-results message in time",
    );
  }

  const cardCount = await page.locator(LISTING_CARD_SELECTOR).count();
  if (cardCount === 0) {
    return { listings: [], hasMore: false };
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
    RESULT_LINK_SELECTOR,
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

  const hasMore = (await page.locator(NEXT_PAGE_SELECTOR).count()) > 0;

  return { listings, hasMore };
}
