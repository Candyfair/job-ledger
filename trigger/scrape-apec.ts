import { task } from "@trigger.dev/sdk/v3";
import {
  runSiteScrape,
  type ScrapeSitePayload,
} from "@/lib/scraping/run-scrape";
import { captureApecPage } from "@/lib/scraping/apec-scraper";

/**
 * Scrapes Apec.fr for one job config. All the work — pagination, extraction,
 * lookback filtering, and the DB writes — lives in
 * {@link runSiteScrape}; this task only binds the Apec capture function and
 * the `"apec"` site slug to it.
 *
 * Side effects (via `runSiteScrape`): `SiteStatus` upsert on a Playwright /
 * bot-challenge failure; `ScrapeRun` insert unless `payload.scrapeRunId` is
 * supplied; `Listing` bulk insert when in-window results are found.
 *
 * `queue.concurrencyLimit: 1` gives Apec the "limited per-site concurrency"
 * politeness guarantee (SPEC.md §7) — runs against Apec serialize, runs
 * against other sites are unaffected.
 */
export const scrapeApec = task({
  id: "scrape-apec",
  queue: { name: "scrape-apec", concurrencyLimit: 1 },
  run: async (payload: ScrapeSitePayload) =>
    runSiteScrape({ site: "apec", capturePage: captureApecPage, payload }),
});
