import { chromium, type Page } from "playwright";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig, listing, scrapeRun } from "@/drizzle/schema";
import type { Site } from "@/lib/sites";
import {
  getExtractionAdapter,
  type ModelUsed,
} from "@/lib/extraction/adapter-registry";
import type { ExtractionAdapter } from "@/lib/extraction/adapter";
import { mergeListingsWithUrls } from "@/lib/extraction/merge-listings";
import {
  isWithinLookbackWindow,
  type LookbackWindow,
} from "@/lib/extraction/lookback-window";
import { matchExclusionKeywords } from "@/lib/filters/exclusion-matching";
import { sleep, randomDelayMs, SCRAPER_USER_AGENT } from "./politeness";
import { buildDelimitedContent } from "./delimited-content";
import { markSiteFailed } from "./site-status";
import { describeScrapeError } from "./errors";
import { isKillSwitchActive } from "./kill-switch";

// SPEC.md §7 — hard ceiling on listings persisted per run, independent of the
// model or the number of result pages a site has.
export const VOLUME_CAP = 50;

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
    searchTerm: string;
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
  /** Persisted-row lookup path. Exactly one of `jobConfigId` /
   * `adHocConfig` must be set — {@link resolveScrapeContext} throws otherwise. */
  jobConfigId?: string;
  /** Inline, never-persisted search params for an anonymous ad-hoc run
   * (`/api/scrape/trigger`'s `adHocSearch` field) — there is no `JobConfig`
   * row to look up, so this bypasses the DB lookup entirely. `title` is the
   * literal site-search term (same role as `JobConfig.title`);
   * `excludedKeywords` are the per-run exclusion keywords fed to
   * {@link matchExclusionKeywords}, and may be empty. */
  adHocConfig?: {
    title: string;
    excludedKeywords: string[];
    location?: string | null;
  };
  lookback: LookbackWindow;
  userId?: string | null;
  scrapeRunId?: string;
  /** Defaults to `"claude_haiku"` when absent (Trigger.dev Test tab /
   * standalone invocation) — see {@link getExtractionAdapter}. */
  model?: ModelUsed;
}

interface RunSiteScrapeOptions {
  site: Site;
  capturePage: CaptureSitePage;
  payload: ScrapeSitePayload;
  /** Defaults to the adapter resolved from `payload.model` via
   * {@link getExtractionAdapter}; injectable for tests. */
  extractionAdapter?: ExtractionAdapter;
}

/**
 * One in-window listing ready to persist. Both `companyNormalized` and
 * `roleCanonical` are nullable: the LLM extraction path fills them, the
 * direct-API Apec path fills `companyNormalized` deterministically and
 * `roleCanonical` via a separate batched adapter call, and either may be
 * `null` when the source signal is absent.
 */
export type CollectedListing = {
  title: string;
  company: string | null;
  companyNormalized: string | null;
  roleCanonical: string | null;
  datePosted: string | null;
  salaryRaw: string | null;
  url: string;
};

export interface RunSiteScrapeResult {
  scrapeRunId: string;
  listingCount: number;
  /** The status this task wrote, or `null` on the reuse path where the
   * orchestrating endpoint owns the run's lifecycle. */
  status: "completed" | "partial_failure" | null;
  anyPageExtractionFailed: boolean;
}

/**
 * Records a site's contribution to a run as skipped because the global kill
 * switch (`SCRAPING_KILL_SWITCH`, see `./kill-switch.ts`) was active — either
 * at trigger time, or flipped after this task was already queued in
 * Trigger.dev. Deliberately does not touch `SiteStatus`/`lastFailureCause`:
 * that table means "this site's markup or bot-protection needs a human to
 * look at it," and an operator-initiated stop is neither, so recording it
 * there would mislead an admin reading the settings page later.
 *
 * The two branches are not symmetric, on purpose:
 * - `payload.scrapeRunId` absent: this task is about to create its own
 *   `ScrapeRun` row, so there is no contention — writing
 *   `status: "partial_failure"` here is a normal, self-contained insert,
 *   the same shape as the existing `completed`/`partial_failure` decision
 *   below for a non-killed run.
 * - `payload.scrapeRunId` present: the row is shared with sibling tasks
 *   from the same fan-out (SPEC.md §7 — one task per (site, jobConfig)
 *   pair against one `ScrapeRun`). No code path writes to an existing
 *   run's `status` today — not on success, not on `markup_broken` /
 *   `bot_challenge` — because nothing yet reconciles per-site outcomes
 *   into a final value (`GET /api/scrape/status/:runId`, SPEC.md §7, is
 *   spec'd but unbuilt). Writing `partial_failure` straight into that
 *   column here would be the first such write, and nothing would ever
 *   correct it even if every sibling site went on to succeed. So this
 *   branch leaves `ScrapeRun.status` untouched — same as the other
 *   failure causes — and only `console.warn`s, matching the existing
 *   soft-signal convention in `hellowork-scraper.ts`.
 */
async function recordKillSwitchSkip(
  site: Site,
  payload: ScrapeSitePayload,
): Promise<RunSiteScrapeResult> {
  const lookback: LookbackWindow =
    payload.lookback.type === "since_date"
      ? { type: "since_date", since: new Date(payload.lookback.since) }
      : payload.lookback;

  if (payload.scrapeRunId) {
    console.warn(
      `Kill switch active — skipping ${site} for ScrapeRun ${payload.scrapeRunId}`,
    );

    return {
      scrapeRunId: payload.scrapeRunId,
      listingCount: 0,
      status: null,
      anyPageExtractionFailed: false,
    };
  }

  const [run] = await db
    .insert(scrapeRun)
    .values({
      userId: payload.userId ?? null,
      lookbackWindowType: lookback.type,
      lookbackSince: lookback.type === "since_date" ? lookback.since : null,
      modelUsed: payload.model ?? "claude_haiku",
      sitesIncluded: [site],
      // The kill switch trips before the JobConfig lookup runs, so there is
      // no resolved id to record here even when payload.jobConfigId was set.
      jobConfigsIncluded: [],
      status: "partial_failure",
    })
    .returning();

  return {
    scrapeRunId: run.id,
    listingCount: 0,
    status: "partial_failure",
    anyPageExtractionFailed: false,
  };
}

/**
 * The resolved, ready-to-scrape search parameters for one `scrape-<site>`
 * task — everything derived from the payload before any network work, shared
 * by {@link runSiteScrape} (HelloWork, Playwright) and `runApecApiScrape`
 * (Apec, direct API). `lookback.since` is already a real `Date` here (see
 * {@link resolveScrapeContext}).
 */
export interface ResolvedScrapeContext {
  searchTerm: string;
  excludedKeywords: string[];
  location: string | null;
  resolvedJobConfigId: string | null;
  lookback: LookbackWindow;
  lookbackSince: Date | null;
}

/**
 * Either a resolved context ready to scrape, or a short-circuit result to
 * return verbatim because the kill switch was active.
 */
export type ScrapeContextResolution =
  { killSwitchSkip: RunSiteScrapeResult } | { context: ResolvedScrapeContext };

/**
 * Runs the pre-scrape work every `scrape-<site>` task shares: the kill-switch
 * check (before anything else — before payload validation, the `JobConfig`
 * lookup, and certainly before any network call), the
 * exactly-one-of-`jobConfigId`/`adHocConfig` validation, the `JobConfig`
 * lookup or ad-hoc-payload passthrough, and the `lookback.since` `Date`
 * coercion.
 *
 * `payload.lookback.since` is coerced back to a real `Date` here: an
 * externally-triggered payload crosses a JSON serialization boundary and
 * `task()` does no schema validation, so `since` arrives as a string despite
 * the `LookbackWindow` type. Coercing once keeps both the DB write and the
 * `isWithinLookbackWindow` comparison correct.
 *
 * @returns `{ killSwitchSkip }` — return it unchanged — when the kill switch
 *   is active; otherwise `{ context }`.
 * @throws Error when neither or both of `payload.jobConfigId` /
 *   `payload.adHocConfig` are set, or when a supplied `jobConfigId` has no
 *   row. `task()` payloads cross a JSON boundary with no schema validation,
 *   so this is an explicit runtime check, not just a type guarantee.
 */
export async function resolveScrapeContext(
  site: Site,
  payload: ScrapeSitePayload,
): Promise<ScrapeContextResolution> {
  if (isKillSwitchActive()) {
    return { killSwitchSkip: await recordKillSwitchSkip(site, payload) };
  }

  if (!!payload.jobConfigId === !!payload.adHocConfig) {
    throw new Error(
      "runSiteScrape requires exactly one of payload.jobConfigId or payload.adHocConfig",
    );
  }

  let searchTerm: string;
  let excludedKeywords: string[];
  let location: string | null;
  let resolvedJobConfigId: string | null = null;

  if (payload.jobConfigId) {
    const [config] = await db
      .select()
      .from(jobConfig)
      .where(eq(jobConfig.id, payload.jobConfigId));

    if (!config) {
      throw new Error(`JobConfig ${payload.jobConfigId} not found`);
    }

    searchTerm = config.title;
    excludedKeywords = config.excludedKeywords;
    location = config.location;
    resolvedJobConfigId = config.id;
  } else {
    searchTerm = payload.adHocConfig!.title;
    excludedKeywords = payload.adHocConfig!.excludedKeywords;
    location = payload.adHocConfig!.location ?? null;
  }

  const lookback: LookbackWindow =
    payload.lookback.type === "since_date"
      ? { type: "since_date", since: new Date(payload.lookback.since) }
      : payload.lookback;
  const lookbackSince = lookback.type === "since_date" ? lookback.since : null;

  return {
    context: {
      searchTerm,
      excludedKeywords,
      location,
      resolvedJobConfigId,
      lookback,
      lookbackSince,
    },
  };
}

/**
 * The shared tail of every `scrape-<site>` task: create or reuse the
 * `ScrapeRun` row, then bulk-insert the collected listings with their
 * `excludedByKeyword` tags. Called by {@link runSiteScrape} (HelloWork) and
 * `runApecApiScrape` (Apec) once each has produced its in-window
 * {@link CollectedListing}s.
 *
 * Side effects:
 * - `ScrapeRun` (insert): only when `payload.scrapeRunId` is absent. When it
 *   is provided the row already exists and its `status` is left untouched —
 *   the orchestrating endpoint rolls per-site outcomes up.
 * - `Listing` (bulk insert): only when `collected` is non-empty.
 *
 * `Listing.excludedByKeyword` is computed here, at write time, rather than
 * lazily at read time: `context.excludedKeywords` (per-`JobConfig` on the
 * persisted path, per-run on the anonymous path) is checked against each
 * collected listing's title via {@link matchExclusionKeywords} right before
 * the insert, so every inserted row always carries an array (never `null`) —
 * empty when nothing matched, and also empty when no exclusion keywords were
 * supplied at all.
 *
 * `status` mirrors the pre-refactor behaviour: on the create path it is
 * `"partial_failure"` when `anyPageExtractionFailed`, else `"completed"`; on
 * the reuse path it is `null` (the caller owns the run's lifecycle).
 */
export async function finalizeScrapeRun({
  site,
  payload,
  context,
  collected,
  anyPageExtractionFailed,
}: {
  site: Site;
  payload: ScrapeSitePayload;
  context: ResolvedScrapeContext;
  collected: CollectedListing[];
  anyPageExtractionFailed: boolean;
}): Promise<RunSiteScrapeResult> {
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
        lookbackWindowType: context.lookback.type,
        lookbackSince: context.lookbackSince,
        modelUsed: payload.model ?? "claude_haiku",
        sitesIncluded: [site],
        jobConfigsIncluded: context.resolvedJobConfigId
          ? [context.resolvedJobConfigId]
          : [],
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
        excludedByKeyword: matchExclusionKeywords(
          item.title,
          context.excludedKeywords,
        ),
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

/**
 * The shared body of every Playwright-driven `scrape-<site>` task
 * (HelloWork today; Apec used this before moving to `runApecApiScrape`):
 * paginate the site's results with a randomized delay between pages,
 * structure each page through the extraction adapter, re-attach captured
 * URLs, keep only listings inside the lookback window, and persist up to
 * {@link VOLUME_CAP} of them.
 *
 * Delegates the shared pre-scrape work to {@link resolveScrapeContext}
 * (kill-switch short-circuit, payload validation, `JobConfig` / ad-hoc
 * resolution, lookback coercion) and the shared persistence tail to
 * {@link finalizeScrapeRun} (`ScrapeRun` create-or-reuse, `Listing` insert).
 *
 * Side effects beyond {@link finalizeScrapeRun}'s:
 * - `SiteStatus` (upsert, via `markSiteFailed`): only when the scrape loop
 *   throws — a selector timeout, navigation failure, `ScrapeMarkupError`, or
 *   `ScrapeBlockedError`. A single page's extraction returning `[]` is NOT a
 *   site failure; it sets `anyPageExtractionFailed` and downgrades the run to
 *   `partial_failure`.
 *
 * `payload.model` selects the extraction adapter via
 * {@link getExtractionAdapter} and is written to `ScrapeRun.modelUsed`;
 * omitted defaults to `"claude_haiku"` (Trigger.dev Test tab / standalone
 * invocation, same testing-convenience pattern as `scrapeRunId`).
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
  const resolution = await resolveScrapeContext(site, payload);
  if ("killSwitchSkip" in resolution) {
    return resolution.killSwitchSkip;
  }
  const context = resolution.context;
  const { searchTerm, location, lookback } = context;

  const adapter =
    extractionAdapter ?? getExtractionAdapter(payload.model ?? "claude_haiku");

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
        searchTerm,
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

  return finalizeScrapeRun({
    site,
    payload,
    context,
    collected,
    anyPageExtractionFailed,
  });
}
