// Standalone harness for iterating on the Apec.fr scraping + extraction
// pipeline without the Trigger.dev dev cycle. No DB writes — prints the
// final merged + lookback-filtered listings as JSON.
//
// Usage: npm run test:scrape:apec

import { chromium } from "playwright";
import { ClaudeHaikuAdapter } from "@/lib/extraction/claude-haiku";
import { mergeListingsWithUrls } from "@/lib/extraction/merge-listings";
import {
  isWithinLookbackWindow,
  type LookbackWindow,
} from "@/lib/extraction/lookback-window";
import { captureApecPage } from "@/lib/scraping/apec-scraper";
import { buildDelimitedContent } from "@/lib/scraping/delimited-content";
import {
  sleep,
  randomDelayMs,
  SCRAPER_USER_AGENT,
} from "@/lib/scraping/politeness";
import { ScrapeBlockedError, ScrapeMarkupError } from "@/lib/scraping/errors";

// Hardcoded search params for local iteration — no JobConfig, no trigger form.
const SEARCH = {
  searchTerm: "développeur",
  location: "Paris",
  lookback: { type: "3d" } as LookbackWindow,
};

const VOLUME_CAP = 50; // SPEC.md §7

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: SCRAPER_USER_AGENT });

  const adapter = new ClaudeHaikuAdapter();
  const finalListings: unknown[] = [];

  try {
    let pageNum = 0;
    let hasMore = true;

    while (hasMore && finalListings.length < VOLUME_CAP) {
      if (pageNum > 0) {
        await sleep(randomDelayMs());
      }

      console.error(`Fetching page ${pageNum}...`);
      const { listings: captured, hasMore: more } = await captureApecPage(
        page,
        {
          searchTerm: SEARCH.searchTerm,
          location: SEARCH.location,
          lookback: SEARCH.lookback,
          page: pageNum,
        },
      );

      if (captured.length === 0) break;

      const delimited = buildDelimitedContent(captured);
      const extracted = await adapter.extractListings(delimited);
      const merged = mergeListingsWithUrls(extracted, captured);

      for (const listing of merged) {
        if (isWithinLookbackWindow(listing.datePosted, SEARCH.lookback)) {
          finalListings.push(listing);
        }
      }

      hasMore = more;
      pageNum += 1;
    }
  } catch (error) {
    if (
      error instanceof ScrapeBlockedError ||
      error instanceof ScrapeMarkupError
    ) {
      console.error(`BLOCKED: [${error.name}] ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(finalListings, null, 2));
  console.error(
    `\nDone. ${finalListings.length} listing(s) within the lookback window.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
