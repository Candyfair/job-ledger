import { chromium, type Page } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig, listing, scrapeRun } from "@/drizzle/schema";
import type { Site } from "@/lib/sites";
import { ClaudeHaikuAdapter } from "@/lib/extraction/claude-haiku";
import type { ExtractionAdapter } from "@/lib/extraction/adapter";
import { mergeListingsWithUrls } from "@/lib/extraction/merge-listings";
import {
  isWithinLookbackWindow,
  type LookbackWindow,
} from "@/lib/extraction/lookback-window";
import { sleep, randomDelayMs, SCRAPER_USER_AGENT } from "./politeness";
import { buildDelimitedContent } from "./delimited-content";
import { markSiteFailed } from "./site-status";
import { describeScrapeError } from "./errors";

// SPEC.md §7 — hard ceiling on listings persisted per run, independent of the
// model or the number of result pages a site has.
const VOLUME_CAP = 50;

/**
 * One listing card captured off a results page by a site scraper. `rawText`
 * is the unstructured blob handed to the LLM; `url` is the Playwright-read
 * href, re-attached post-extraction and never sent to the model (SPEC.md §4).
 */
export interface CapturedSiteListing {
  listingId: string;
  url: string;
  rawText: string;
}

/**
 * Navigates to and captures a single results page for one site. Site scrapers
 * implement this; {@link runSiteScrape} drives it page by page. Must throw
 * `ScrapeBlockedError` / `ScrapeMarkupError` (or let a Playwright error
 * propagate) on an unrecognized page — never return a partial result.
 */
export type CaptureSitePage = (
  page: Page,
  params: {
    keywords: string;
    location?: string | null;
    lookback: LookbackWindow;
    page: number;
  },
) => Promise<{ listings: CapturedSiteListing[]; hasMore: boolean }>;

/**
 * Payload shape shared by every `scrape-<site>` Trigger.dev task.
 *
 * `scrapeRunId` is set when `/api/scrape/trigger` (Session 5) orchestrates a
 * multi-site run: it creates the `ScrapeRun` row once and passes the id to
 * each site task, which then only appends listings. Absent — Trigger.dev's
 * Test tab, the local `scripts/test-scrape-*` harnesses, any standalone
 * invocation — the task creates its own single-site `ScrapeRun`.
 */
export interface ScrapeSitePayload {
  jobConfigId: string;
  lookback: LookbackWindow;
  userId?: string | null;
  scrapeRunId?: string;
}

interface RunSiteScrapeOptions {
  site: Site;
  capturePage: CaptureSitePage;
  payload: ScrapeSitePayload;
  /** Defaults to a fresh {@link ClaudeHaikuAdapter}; injectable for the
   * future DeepSeek adapter (Session 6) and for tests. */
  extractionAdapter?: ExtractionAdapter;
}

type CollectedListing = {
  title: string;
  company: string | null;
  companyNormalized: string | null;
  roleCanonical: string | null;
  datePosted: string | null;
  salaryRaw: string | null;
  url: string;
};

interface RunSiteScrapeResult {
  scrapeRunId: string;
  listingCount: number;
  /** The status this task wrote, or `null` on the reuse path where the
   * orchestrating endpoint owns the run's lifecycle. */
  status: "completed" | "partial_failure" | null;
  anyPageExtractionFailed: boolean;
}

/**
 * The shared body of every `scrape-<site>` task: paginate the site's results
 * with a randomized delay between pages, structure each page through the
 * extraction adapter, re-attach captured URLs, keep only listings inside the
 * lookback window, and persist up to {@link VOLUME_CAP} of them.
 *
 * Side effects:
 * - `SiteStatus` (upsert, via `markSiteFailed`): only when the scrape loop
 *   throws — a selector timeout, navigation failure, `ScrapeMarkupError`, or
 *   `ScrapeBlockedError`. A single page's extraction returning `[]` is NOT a
 *   site failure; it sets `anyPageExtractionFailed` and downgrades the run to
 *   `partial_failure`.
 * - `ScrapeRun` (insert): only when `payload.scrapeRunId` is absent. When it
 *   is provided the row already exists and its `status` is left untouched —
 *   the caller rolls per-site outcomes up.
 * - `Listing` (bulk insert): only when at least one in-window listing was
 *   collected.
 *
 * `payload.lookback.since` is coerced back to a real `Date` here: an
 * externally-triggered payload crosses a JSON serialization boundary and
 * `task()` does no schema validation, so `since` arrives as a string despite
 * the `LookbackWindow` type. Coercing once keeps both the DB write and the
 * `isWithinLookbackWindow` comparison correct.
 *
 * Re-throws after recording the failure so Trigger.dev marks the attempt
 * failed.
 */
export async function runSiteScrape({
  site,
  capturePage,
  payload,
  extractionAdapter,
}: RunSiteScrapeOptions): Promise<RunSiteScrapeResult> {
  const [config] = await db
    .select()
    .from(jobConfig)
    .where(eq(jobConfig.id, payload.jobConfigId));

  if (!config) {
    throw new Error(`JobConfig ${payload.jobConfigId} not found`);
  }

  const keywords = config.keywords.join(" ");
  const location = config.location;
  const lookback: LookbackWindow =
    payload.lookback.type === "since_date"
      ? { type: "since_date", since: new Date(payload.lookback.since) }
      : payload.lookback;
  const lookbackSince = lookback.type === "since_date" ? lookback.since : null;

  const adapter = extractionAdapter ?? new ClaudeHaikuAdapter();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: SCRAPER_USER_AGENT });

  const collected: CollectedListing[] = [];
  let anyPageExtractionFailed = false;

  try {
    let pageNum = 0;
    let hasMore = true;

    while (hasMore && collected.length < VOLUME_CAP) {
      if (pageNum > 0) {
        await sleep(randomDelayMs());
      }

      const { listings: captured, hasMore: more } = await capturePage(page, {
        keywords,
        location,
        lookback,
        page: pageNum,
      });

      if (captured.length === 0) break;

      const delimited = buildDelimitedContent(captured);
      const extracted = await adapter.extractListings(delimited);
      if (extracted.length === 0) {
        anyPageExtractionFailed = true;
      }

      const merged = mergeListingsWithUrls(extracted, captured);
      for (const item of merged) {
        if (isWithinLookbackWindow(item.datePosted, lookback)) {
          collected.push({
            title: item.title,
            company: item.company,
            companyNormalized: item.companyNormalized,
            roleCanonical: item.roleCanonical,
            datePosted: item.datePosted,
            salaryRaw: item.salaryRaw,
            url: item.url,
          });
          // The outer `while` guard is only re-checked once a page finishes,
          // but a single page's in-window listings can carry `collected`
          // past VOLUME_CAP before that happens (SPEC.md §7). Stop pushing
          // and suppress the next page fetch as soon as the cap is hit,
          // rather than truncating the array after the fact.
          if (collected.length >= VOLUME_CAP) {
            hasMore = false;
            break;
          }
        }
      }

      hasMore = more && hasMore;
      pageNum += 1;
    }
  } catch (error) {
    await browser.close();
    const { cause, note } = describeScrapeError(error, site);
    await markSiteFailed(site, cause, note);
    throw error;
  }

  await browser.close();

  let scrapeRunId: string;
  let status: RunSiteScrapeResult["status"] = null;

  if (payload.scrapeRunId) {
    scrapeRunId = payload.scrapeRunId;
  } else {
    status = anyPageExtractionFailed ? "partial_failure" : "completed";
    const [run] = await db
      .insert(scrapeRun)
      .values({
        userId: payload.userId ?? null,
        lookbackWindowType: lookback.type,
        lookbackSince,
        modelUsed: "claude_haiku",
        sitesIncluded: [site],
        jobConfigsIncluded: [payload.jobConfigId],
        status,
      })
      .returning();
    scrapeRunId = run.id;
  }

  if (collected.length > 0) {
    await db.insert(listing).values(
      collected.map((item) => ({
        scrapeRunId,
        site,
        title: item.title,
        company: item.company,
        companyNormalized: item.companyNormalized,
        roleCanonical: item.roleCanonical,
        datePosted: item.datePosted,
        salaryRaw: item.salaryRaw,
        url: item.url,
      })),
    );
  }

  return {
    scrapeRunId,
    listingCount: collected.length,
    status,
    anyPageExtractionFailed,
  };
}
