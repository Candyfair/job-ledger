// THROWAWAY PRE-SESSION-4 SPIKE — proves the Trigger.dev / SiteStatus write
// path end to end. Not the real multi-site Apec.fr implementation.

import { task } from "@trigger.dev/sdk/v3";
import { chromium } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig, listing, scrapeRun, siteStatus } from "@/drizzle/schema";
import { ClaudeHaikuAdapter } from "@/lib/extraction/claude-haiku";
import { mergeListingsWithUrls } from "@/lib/extraction/merge-listings";
import {
  isWithinLookbackWindow,
  type LookbackWindow,
} from "@/lib/extraction/lookback-window";
import {
  captureApecPage,
  buildDelimitedContent,
  randomDelayMs,
  sleep,
  ApecBlockedError,
} from "@/lib/scraping/apec-scraper";

const VOLUME_CAP = 50; // SPEC.md §7
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface ScrapeApecPayload {
  jobConfigId: string;
  lookback: LookbackWindow;
  // No trigger form exists until Session 5 — a run is either tied to the
  // JobConfig owner or left anonymous, matching ScrapeRun.userId's nullable
  // shape.
  userId?: string | null;
}

async function markSiteFailed(message: string) {
  await db
    .insert(siteStatus)
    .values({
      site: "apec",
      active: false,
      lastErrorAt: new Date(),
      lastErrorNote: message,
    })
    .onConflictDoUpdate({
      target: siteStatus.site,
      set: { active: false, lastErrorAt: new Date(), lastErrorNote: message },
    });
}

export const scrapeApec = task({
  id: "scrape-apec",
  run: async (payload: ScrapeApecPayload) => {
    const [config] = await db
      .select()
      .from(jobConfig)
      .where(eq(jobConfig.id, payload.jobConfigId));

    if (!config) {
      throw new Error(`JobConfig ${payload.jobConfigId} not found`);
    }

    const keywords = config.keywords.join(" ");
    const location = config.location;
    // Payloads triggered externally (e.g. Trigger.dev's Test tab, or a real
    // form submission once one exists) cross a JSON serialization boundary —
    // `since` arrives as a string despite LookbackWindow's `Date` type, which
    // `task()` (no schema validation) never catches. Coercing once here keeps
    // both the DB write and the Date comparison in isWithinLookbackWindow
    // correct regardless of how this task was invoked.
    const lookback: LookbackWindow =
      payload.lookback.type === "since_date"
        ? { type: "since_date", since: new Date(payload.lookback.since) }
        : payload.lookback;
    const lookbackSince =
      lookback.type === "since_date" ? lookback.since : null;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: USER_AGENT });

    type CollectedListing = {
      title: string;
      company: string | null;
      companyNormalized: string | null;
      roleCanonical: string | null;
      datePosted: string | null;
      salaryRaw: string | null;
      url: string;
    };
    const collected: CollectedListing[] = [];
    let anyPageExtractionFailed = false;

    try {
      const adapter = new ClaudeHaikuAdapter();
      let pageNum = 0;
      let hasMore = true;

      while (hasMore && collected.length < VOLUME_CAP) {
        if (pageNum > 0) {
          await sleep(randomDelayMs());
        }

        const { listings: captured, hasMore: more } = await captureApecPage(
          page,
          { keywords, location, lookback, page: pageNum },
        );

        if (captured.length === 0) break;

        const delimited = buildDelimitedContent(captured);
        const extracted = await adapter.extractListings(delimited);
        if (extracted.length === 0) {
          // A page-level refusal/parse failure inside the adapter (already
          // logged there) — not a site-wide failure, but the run as a whole
          // is only a partial success.
          anyPageExtractionFailed = true;
        }

        const merged = mergeListingsWithUrls(extracted, captured);
        for (const item of merged) {
          if (isWithinLookbackWindow(item.datePosted, lookback)) {
            collected.push(item);
          }
        }

        hasMore = more;
        pageNum += 1;
      }
    } catch (error) {
      await browser.close();
      // Selector timeout, navigation failure, or a detected unrecognized
      // page shape are all the same site-wide failure (SPEC.md §5) — no
      // anti-bot circumvention, just mark the site inactive and surface it.
      const message =
        error instanceof ApecBlockedError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      await markSiteFailed(message);
      throw error;
    }

    await browser.close();

    const [run] = await db
      .insert(scrapeRun)
      .values({
        userId: payload.userId ?? null,
        lookbackWindowType: lookback.type,
        lookbackSince,
        modelUsed: "claude_haiku",
        sitesIncluded: ["apec"],
        jobConfigsIncluded: [payload.jobConfigId],
        status: anyPageExtractionFailed ? "partial_failure" : "completed",
      })
      .returning();

    if (collected.length > 0) {
      await db.insert(listing).values(
        collected.map((item) => ({
          scrapeRunId: run.id,
          site: "apec" as const,
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
      scrapeRunId: run.id,
      listingCount: collected.length,
      status: run.status,
    };
  },
});
