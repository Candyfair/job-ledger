// THROWAWAY PRE-SESSION-4 SPIKE — proves the Trigger.dev / SiteStatus write
// path end to end. Not the real multi-site Apec.fr implementation.

import type { Page } from "playwright";
import { buildApecSearchUrl } from "./apec-url";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";

export interface CapturedApecListing {
  listingId: string;
  url: string;
  rawText: string;
}

export interface ApecPageResult {
  listings: CapturedApecListing[];
  hasMore: boolean;
}

// Selector failure / an unrecognized page shape are both treated as this
// site-wide failure by callers (SPEC.md §5 SiteStatus path) — never retried
// or worked around (no anti-bot circumvention, per policy). No Cloudflare-
// style bot-verification wall was observed against Apec.fr during this
// spike's live inspection, so detection here is generalized (interstitial /
// listing selector unexpectedly missing) rather than a specific string match
// like Indeed's, per the plan's instruction.
export class ApecBlockedError extends Error {}

// Confirmed via live inspection on 2026-08-26 (apec.fr). Structurally
// different from Indeed: the clickable `<a>` wraps the ENTIRE card
// (container-result > div > a > apec-recherche-resultat > .card-offer)
// rather than nesting a title-only anchor inside the card, so the href is
// read off the wrapping anchor, not a child. Company/title/salary/location/
// date are captured as one raw text blob per card (not per-field selectors)
// and left for Claude to structure, consistent with "Playwright captures,
// Claude structures" (CLAUDE.md decision #1).
const RESULT_LINK_SELECTOR = ".container-result > div > a";
const LISTING_CARD_SELECTOR = ".card-offer";
// The trailing <li class="page-item"> in the pagination nav contains an
// (icon-only, textless) <a> only when a next page exists — confirmed empty
// on the true last page (page 22 of 22) during live inspection.
const NEXT_PAGE_SELECTOR = "ul.pagination > li.page-item:last-child > a";
// Didomi GDPR consent modal — blocks/overlays the page on first load. No
// Indeed equivalent; must be dismissed before any listing interaction.
const COOKIE_REFUSE_SELECTOR = "#didomi-notice-disagree-button";
// Shown instead of any cards when a search genuinely has zero matches —
// confirmed via live inspection against a nonsense keyword. Used only to
// distinguish "genuinely empty" from "content never rendered" below.
const NO_RESULTS_TEXT = "Aucune offre ne correspond";

/**
 * Dismisses the Didomi GDPR consent modal, which has no Indeed equivalent
 * and blocks/overlays the page on first load. The banner is injected
 * client-side and may not exist yet right after `domcontentloaded` — this
 * is a bounded wait, not fatal if the banner never appears (e.g. a repeat
 * visit where consent was already recorded).
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
 * fires, unlike Indeed's server-rendered cards, so `page.goto`'s own wait
 * condition is not enough here. Races a listing card against the confirmed
 * "no results" text, whichever appears first; if neither shows up within
 * the timeout, the caller (`captureApecPage`) treats the page shape as
 * unrecognized (interstitial, layout change, or an unknown block page) and
 * throws {@link ApecBlockedError}.
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

/** Awaits a plain timeout — used between page fetches for scraping politeness (SPEC.md §7). */
export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Randomized inter-request delay for scraping politeness (SPEC.md §7). */
export function randomDelayMs(min = 1500, max = 3500): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Navigates to and captures one page of Apec.fr search results. Differs
 * from the Indeed pattern (`captureIndeedPage`) in two ways specific to
 * Apec: it dismisses the Didomi cookie-consent modal after navigation, and
 * it waits for client-rendered cards ({@link waitForResultsToRender})
 * instead of relying on `domcontentloaded` alone, since Apec.fr is an
 * Angular SPA.
 *
 * Throws {@link ApecBlockedError} — never retried or worked around, per the
 * no-anti-bot-circumvention policy — when the results never render in time,
 * or when cards are counted but the wrapping-anchor structure they're read
 * from doesn't match (an unrecognized page shape either way). Callers
 * (`/trigger/scrape-apec.ts`) treat this as a site-wide failure and write it
 * to `SiteStatus`.
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
  await dismissCookieConsent(page);

  try {
    await waitForResultsToRender(page);
  } catch {
    throw new ApecBlockedError(
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
    throw new ApecBlockedError(
      "Apec.fr listing cards found but result-link structure did not match",
    );
  }

  const listings: CapturedApecListing[] = [];
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

/**
 * Serializes captured cards into the `<<<LISTING id="...">>>`-delimited
 * format the extraction adapter's system prompt expects (see
 * `EXTRACTION_SYSTEM_PROMPT` in `/lib/extraction/prompt.ts`). Same format as
 * Indeed's `buildDelimitedContent` — kept as a per-site duplicate rather
 * than a shared helper since each site's `Captured*Listing` type differs.
 */
export function buildDelimitedContent(listings: CapturedApecListing[]): string {
  return listings
    .map(
      (l) =>
        `<<<LISTING id="${l.listingId}">>>\n${l.rawText}\n<<<END_LISTING>>>`,
    )
    .join("\n\n");
}
