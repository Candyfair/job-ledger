import { task } from "@trigger.dev/sdk/v3";
import type { ScrapeSitePayload } from "@/lib/scraping/run-scrape";
import { runApecApiScrape } from "@/lib/scraping/run-apec-api";

/**
 * Scrapes Apec.fr for one job config. Unlike HelloWork, Apec does not go
 * through the Playwright + LLM-extraction loop: it calls Apec's own search
 * web-service directly ({@link runApecApiScrape}), which returns structured
 * per-listing JSON (SPEC.md §4 "Apec exception"). This task only binds the
 * `"apec"` slug and payload to that runner.
 *
 * Side effects (via `runApecApiScrape`): `SiteStatus` upsert on a transport
 * failure / bot challenge / response-shape drift; `ScrapeRun` insert unless
 * `payload.scrapeRunId` is supplied; `Listing` bulk insert when in-window
 * results are found. A location string that doesn't resolve to an Apec
 * `lieuId` downgrades the run to `partial_failure` with an operator-facing
 * note — never a `SiteStatus` flip.
 *
 * `queue.concurrencyLimit: 1` gives Apec the "limited per-site concurrency"
 * politeness guarantee (SPEC.md §7) — runs against Apec serialize, runs
 * against other sites are unaffected.
 */
export const scrapeApec = task({
  id: "scrape-apec",
  queue: { name: "scrape-apec", concurrencyLimit: 1 },
  run: async (payload: ScrapeSitePayload) =>
    runApecApiScrape({ site: "apec", payload }),
});
