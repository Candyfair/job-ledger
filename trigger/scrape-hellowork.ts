import { task } from "@trigger.dev/sdk/v3";
import {
  runSiteScrape,
  type ScrapeSitePayload,
} from "@/lib/scraping/run-scrape";
import { captureHelloworkPage } from "@/lib/scraping/hellowork-scraper";

/**
 * Scrapes HelloWork for one job config. All the work — pagination,
 * extraction, lookback filtering, and the DB writes — lives in
 * {@link runSiteScrape}; this task only binds the HelloWork capture function
 * and the `"hellowork"` site slug to it.
 *
 * Side effects (via `runSiteScrape`): `SiteStatus` upsert on a Playwright /
 * bot-challenge failure; `ScrapeRun` insert unless `payload.scrapeRunId` is
 * supplied; `Listing` bulk insert when in-window results are found.
 *
 * `queue.concurrencyLimit: 1` gives HelloWork the "limited per-site
 * concurrency" politeness guarantee (SPEC.md §7) — runs against HelloWork
 * serialize, runs against other sites are unaffected.
 *
 * NOTE: `captureHelloworkPage`'s selectors and `buildHelloworkSearchUrl`'s
 * params are UNVERIFIED scaffolding (see those files' headers) — a live run
 * will fail with a `markup_broken` `SiteStatus` write until they're
 * confirmed.
 */
export const scrapeHellowork = task({
  id: "scrape-hellowork",
  queue: { name: "scrape-hellowork", concurrencyLimit: 1 },
  run: async (payload: ScrapeSitePayload) =>
    runSiteScrape({
      site: "hellowork",
      capturePage: captureHelloworkPage,
      payload,
    }),
});
