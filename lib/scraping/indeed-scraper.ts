import type { Page } from "playwright";
import { buildIndeedSearchUrl } from "./indeed-url";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";

export interface CapturedIndeedListing {
  listingId: string;
  url: string;
  rawText: string;
}

export interface IndeedPageResult {
  listings: CapturedIndeedListing[];
  hasMore: boolean;
}

// Selector failure / a captured page turning out to be a bot-verification
// challenge are both treated as this site-wide failure by callers (SPEC.md
// §5 SiteStatus path) — never retried or worked around (no anti-bot
// circumvention, per policy).
export class IndeedBlockedError extends Error {}

// Confirmed via live inspection on 2026-08-25 (fr.indeed.com). The card
// container and title anchor are deliberately the only selectors this module
// depends on — company/location/salary/date are captured as one raw text
// blob per card (not via separate per-field testids) and left for Claude to
// structure, consistent with "Playwright captures, Claude structures"
// (CLAUDE.md decision #1). This is also more robust to Indeed markup churn
// than depending on several field-level selectors.
const LISTING_CARD_SELECTOR = ".job_seen_beacon";
const TITLE_ANCHOR_SELECTOR = "a.jcs-JobTitle";
const NEXT_PAGE_SELECTOR = "a[data-testid='pagination-page-next']";

/** Matches known Indeed bot-verification challenge page copy (Cloudflare-style interstitial). */
function isBlockedPageText(bodyText: string): boolean {
  return (
    bodyText.includes("Additional Verification Required") ||
    bodyText.includes("Ray ID") ||
    bodyText.toLowerCase().includes("checking your browser")
  );
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
 * Navigates to and captures one page of fr.indeed.com search results.
 * Relies on `domcontentloaded` alone (Indeed's cards are server-rendered,
 * unlike Apec.fr's client-rendered Angular SPA — contrast
 * `captureApecPage`), then checks the rendered body text for known
 * bot-verification challenge strings ({@link isBlockedPageText}).
 *
 * Throws {@link IndeedBlockedError} — never retried or worked around, per
 * the no-anti-bot-circumvention policy — when a challenge page is detected.
 * Callers (`/trigger/scrape-indeed.ts`) treat this as a site-wide failure
 * and write it to `SiteStatus`.
 */
export async function captureIndeedPage(
  page: Page,
  params: {
    keywords: string;
    location?: string | null;
    lookback: LookbackWindow;
    page: number;
  },
): Promise<IndeedPageResult> {
  const url = buildIndeedSearchUrl(params);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (isBlockedPageText(bodyText)) {
    throw new IndeedBlockedError(
      "Indeed returned a bot-verification challenge page",
    );
  }

  const cardCount = await page.locator(LISTING_CARD_SELECTOR).count();
  if (cardCount === 0) {
    return { listings: [], hasMore: false };
  }

  const rawCards = await page.locator(LISTING_CARD_SELECTOR).evaluateAll(
    (cards, titleSelector) =>
      cards.map((card) => {
        const anchor = card.querySelector(titleSelector);
        return {
          href: anchor?.getAttribute("href") ?? null,
          rawText: (card as HTMLElement).innerText,
        };
      }),
    TITLE_ANCHOR_SELECTOR,
  );

  const listings: CapturedIndeedListing[] = [];
  rawCards.forEach((card, index) => {
    if (!card.href) {
      console.warn(`Listing at index ${index} has no href — dropping`);
      return;
    }
    // href may be relative, or an absolute /pagead/clk?... sponsored
    // redirect — captured as-is. Synthesizing a "cleaner" canonical
    // viewjob?jk= URL was tried and rejected: navigating there directly
    // (without the referrer/session a real click carries) triggers Indeed's
    // bot-detection sign-in wall. The raw href is what a real user's
    // browser would follow, so it's what gets stored.
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
 * Apec's `buildDelimitedContent` — kept as a per-site duplicate rather than
 * a shared helper since each site's `Captured*Listing` type differs.
 */
export function buildDelimitedContent(
  listings: CapturedIndeedListing[],
): string {
  return listings
    .map(
      (l) =>
        `<<<LISTING id="${l.listingId}">>>\n${l.rawText}\n<<<END_LISTING>>>`,
    )
    .join("\n\n");
}
