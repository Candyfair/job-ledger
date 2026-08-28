import type { Page } from "playwright";
import { buildApecSearchUrl } from "./apec-url";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";
import type { CapturedSiteListing } from "./run-scrape";
import {
  ScrapeBlockedError,
  ScrapeMarkupError,
  isBotChallengePage,
} from "./errors";

/**
 * Result of capturing one Apec.fr results page. `hasMore` reflects whether a
 * "next page" control is present, not whether the volume cap is reached —
 * that's {@link runSiteScrape}'s concern.
 */
export interface ApecPageResult {
  listings: CapturedSiteListing[];
  hasMore: boolean;
}

// Confirmed via live inspection on 2026-08-26 (apec.fr). The clickable `<a>`
// wraps the ENTIRE card (container-result > div > a >
// apec-recherche-resultat > .card-offer) rather than nesting a title-only
// anchor inside the card, so the href is read off the wrapping anchor, not
// a child. Company/title/salary/location/date are captured as one raw text
// blob per card (not per-field selectors) and left for Claude to structure,
// consistent with "Playwright captures, Claude structures" (CLAUDE.md
// decision #1).
const RESULT_LINK_SELECTOR = ".container-result > div > a";
const LISTING_CARD_SELECTOR = ".card-offer";
// The trailing <li class="page-item"> in the pagination nav contains an
// (icon-only, textless) <a> only when a next page exists — confirmed empty
// on the true last page (page 22 of 22) during live inspection.
const NEXT_PAGE_SELECTOR = "ul.pagination > li.page-item:last-child > a";
// Didomi GDPR consent modal — blocks/overlays the page on first load, must
// be dismissed before any listing interaction.
const COOKIE_REFUSE_SELECTOR = "#didomi-notice-disagree-button";
// Shown instead of any cards when a search genuinely has zero matches —
// confirmed via live inspection against a nonsense keyword. Used only to
// distinguish "genuinely empty" from "content never rendered" below.
const NO_RESULTS_TEXT = "Aucune offre ne correspond";

/**
 * Dismisses the Didomi GDPR consent modal, which blocks/overlays the page
 * on first load. The banner is injected client-side and may not exist yet
 * right after `domcontentloaded` — this is a bounded wait, not fatal if the
 * banner never appears (e.g. a repeat visit where consent was already
 * recorded).
 */
async function dismissCookieConsent(page: Page): Promise<void> {
  const refuseButton = page.locator(COOKIE_REFUSE_SELECTOR);
  await refuseButton
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  if (await refuseButton.count()) {
    await refuseButton.click();
  }
}

/**
 * Waits for Apec's search results to actually exist in the DOM. Apec.fr is
 * an Angular SPA — cards are rendered client-side after `domcontentloaded`
 * fires, so `page.goto`'s own wait condition is not enough here. Races a
 * listing card against the confirmed "no results" text, whichever appears
 * first; if neither shows up within the timeout, the caller
 * (`captureApecPage`) treats the page shape as unrecognized (a layout
 * change) and throws {@link ScrapeMarkupError}.
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
 * Navigates to and captures one page of Apec.fr search results. Dismisses
 * the Didomi cookie-consent modal after navigation, checks for a bot-
 * verification interstitial, then waits for client-rendered cards
 * ({@link waitForResultsToRender}) instead of relying on `domcontentloaded`
 * alone, since Apec.fr is an Angular SPA.
 *
 * Throws — never retried or worked around (SPEC.md §2, §5):
 * - {@link ScrapeBlockedError} when the page is a recognized bot-challenge
 *   interstitial rather than results;
 * - {@link ScrapeMarkupError} when results never render, or when cards are
 *   counted but the wrapping-anchor structure doesn't match.
 * Callers (`/trigger/scrape-apec.ts` → `runSiteScrape`) treat either as a
 * site-wide failure and write it to `SiteStatus`.
 */
export async function captureApecPage(
  page: Page,
  params: {
    keywords: string;
    location?: string | null;
    lookback: LookbackWindow;
    page: number;
  },
): Promise<ApecPageResult> {
  const url = buildApecSearchUrl(params);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  if (isBotChallengePage(await page.locator("body").innerText())) {
    throw new ScrapeBlockedError(
      "Apec.fr served a bot-verification page instead of search results",
    );
  }

  await dismissCookieConsent(page);

  try {
    await waitForResultsToRender(page);
  } catch {
    throw new ScrapeMarkupError(
      "Apec.fr page did not render listings or a no-results message in time",
    );
  }

  const cardCount = await page.locator(LISTING_CARD_SELECTOR).count();
  if (cardCount === 0) {
    return { listings: [], hasMore: false };
  }

  const rawCards = await page.locator(RESULT_LINK_SELECTOR).evaluateAll(
    (anchors, cardSelector) =>
      anchors.map((anchor) => {
        const card = anchor.querySelector(cardSelector);
        return {
          href: anchor.getAttribute("href"),
          rawText: (card as HTMLElement | null)?.innerText ?? "",
        };
      }),
    LISTING_CARD_SELECTOR,
  );

  if (rawCards.length === 0) {
    // Cards were counted but the wrapping-anchor structure wasn't found —
    // an unexpected page shape, not a "genuinely zero results" case.
    throw new ScrapeMarkupError(
      "Apec.fr listing cards found but result-link structure did not match",
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
