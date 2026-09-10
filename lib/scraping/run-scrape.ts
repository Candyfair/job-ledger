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
import {
  writeSiteOutcome,
  recomputeAndWriteRunStatus,
  type ScrapeRunStatus,
} from "@/lib/run-status";
import { sleep, randomDelayMs, SCRAPER_USER_AGENT } from "./politeness";
import { buildDelimitedContent } from "./delimited-content";
import { markSiteFailed } from "./site-status";
import {
  describeScrapeError,
  InvalidScrapeConfigError,
  type SiteFailureCause,
} from "./errors";
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
  /** The run's status immediately after this task's `ScrapeRunSite` write and
   * the ensuing {@link recomputeAndWriteRunStatus}. May still be `"running"`
   * when sibling tasks in the same fan-out haven't reported yet — this task
   * never owns the run's lifecycle, it only contributes one row. Informational
   * (task results are not awaited anywhere); the authoritative value lives on
   * `ScrapeRun.status`. */
  status: ScrapeRunStatus;
  anyPageExtractionFailed: boolean;
  /** Present only when a site contributed nothing for a reason worth
   * surfacing to the operator (e.g. Apec's location string didn't resolve).
   * A soft signal — it rides alongside a `partial_failure`, never a
   * `SiteStatus` flip. */
  note?: string;
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
 * Both branches now go through the run-status rollup identically (SPEC.md §4,
 * §9 — this supersedes the earlier asymmetry where the shared-`ScrapeRun`
 * branch only `console.warn`ed and left `ScrapeRun.status` untouched, the
 * Session 6 gap): write `outcome: "skipped"` on this task's own
 * `ScrapeRunSite` row, then delegate to {@link recomputeAndWriteRunStatus}.
 * `combineRunStatus` turns an all-`skipped` run into `partial_failure`, and a
 * `skipped` alongside a sibling `completed` into `completed`.
 *
 * - `payload.scrapeRunId` present (orchestrated fan-out): the `ScrapeRunSite`
 *   row was pre-created `pending` by `POST /api/scrape/trigger` and keyed on
 *   `payload.jobConfigId` — {@link writeSiteOutcome} UPDATEs that exact row.
 *   `payload.jobConfigId` comes straight off this task's own payload; the kill
 *   switch only skips the *`JobConfig` record* lookup, not knowledge of which
 *   id this task was dispatched for.
 * - `payload.scrapeRunId` absent (standalone Test-tab / script): still create
 *   a single-site `ScrapeRun` (so the result carries a real id, existing
 *   behavior) but leave `status` at its `"running"` default — recompute
 *   resolves it to `partial_failure`.
 */
async function recordKillSwitchSkip(
  site: Site,
  payload: ScrapeSitePayload,
): Promise<RunSiteScrapeResult> {
  const lookback: LookbackWindow =
    payload.lookback.type === "since_date"
      ? { type: "since_date", since: new Date(payload.lookback.since) }
      : payload.lookback;

  let scrapeRunId: string;
  if (payload.scrapeRunId) {
    scrapeRunId = payload.scrapeRunId;
  } else {
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
        // status left at its "running" default — recompute writes it below.
      })
      .returning();
    scrapeRunId = run.id;
  }

  await writeSiteOutcome(db, {
    scrapeRunId,
    site,
    jobConfigId: payload.jobConfigId ?? null,
    outcome: "skipped",
  });
  const status = await recomputeAndWriteRunStatus(scrapeRunId);

  return {
    scrapeRunId,
    listingCount: 0,
    status,
    anyPageExtractionFailed: false,
  };
}

/**
 * Records a site task's failure on its own `ScrapeRunSite` row and refreshes
 * the run status — the run-status-rollup counterpart to {@link markSiteFailed}'s
 * global `SiteStatus` write. Call it right after `markSiteFailed` in a scrape
 * catch block.
 *
 * No-op when the task has no `payload.scrapeRunId` (standalone Test-tab /
 * `scripts/test-scrape-*` invocation): the failure path writes no `Listing`
 * rows, so there is no parent-run FK forcing a `ScrapeRun` to exist, and one
 * created solely to carry a `partial_failure` would be an orphan that no
 * consumer ever reads (SPEC.md §9). `payload.jobConfigId` (not any resolved
 * id) keys the pre-created row.
 */
export async function recordSiteFailure(
  site: Site,
  payload: ScrapeSitePayload,
  failureCause: SiteFailureCause,
): Promise<void> {
  if (!payload.scrapeRunId) return;
  await writeSiteOutcome(db, {
    scrapeRunId: payload.scrapeRunId,
    site,
    jobConfigId: payload.jobConfigId ?? null,
    outcome: "failed",
    failureCause,
  });
  await recomputeAndWriteRunStatus(payload.scrapeRunId);
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
 * @throws InvalidScrapeConfigError when the resolved search term is blank
 *   after trimming — a config fault that must fail the run without
 *   deactivating the site (see the error's doc comment).
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

    searchTerm = config.title.trim();
    excludedKeywords = config.excludedKeywords;
    location = config.location?.trim() || null;
    resolvedJobConfigId = config.id;
  } else {
    searchTerm = payload.adHocConfig!.title.trim();
    excludedKeywords = payload.adHocConfig!.excludedKeywords;
    location = payload.adHocConfig!.location?.trim() || null;
  }

  // The search term is `title` verbatim — Apec `motsCles`, HelloWork `k`.
  // Every entry point (`/api/job-configs`, `/api/scrape/trigger`) already
  // rejects a blank title, but a blank one reaching here would be sent as an
  // empty query and pull back an unfiltered, match-everything result set
  // rather than failing — exactly the 2026-09-02 HelloWork incident. Fail
  // loud instead; this is a config fault, so it must not deactivate the site
  // (thrown before Playwright launches and outside the scrape try/catch, so
  // `markSiteFailed` is never reached).
  if (searchTerm === "") {
    throw new InvalidScrapeConfigError(
      payload.jobConfigId
        ? `JobConfig ${payload.jobConfigId} has a blank title — cannot run a site search with an empty query`
        : "Ad-hoc search has a blank title — cannot run a site search with an empty query",
    );
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
 * - `ScrapeRun` (insert): only when `payload.scrapeRunId` is absent, and
 *   always with `status` at its `"running"` default — this function never
 *   writes `ScrapeRun.status` directly (see below).
 * - `Listing` (bulk insert): only when `collected` is non-empty.
 * - `ScrapeRunSite` (one row UPDATE, or INSERT on the standalone create
 *   path): this task's own outcome —
 *   `"empty_extraction"` when `anyPageExtractionFailed` or zero listings
 *   landed, else `"completed"` — plus `listingCount`. Lock-free (unique key
 *   per task).
 * - `ScrapeRun.status` (at most one UPDATE): only via
 *   {@link recomputeAndWriteRunStatus}, which this function calls after the
 *   `ScrapeRunSite` write. Individual tasks never touch `ScrapeRun.status`
 *   themselves — they write their own `ScrapeRunSite` row (which never
 *   conflicts with a sibling task) and delegate to that shared function, the
 *   sole writer and the only place taking the run's row lock.
 *
 * `Listing.excludedByKeyword` is computed here, at write time, rather than
 * lazily at read time: `context.excludedKeywords` (per-`JobConfig` on the
 * persisted path, per-run on the anonymous path) is checked against each
 * collected listing's title via {@link matchExclusionKeywords} right before
 * the insert, so every inserted row always carries an array (never `null`) —
 * empty when nothing matched, and also empty when no exclusion keywords were
 * supplied at all.
 *
 * `RunSiteScrapeResult.status` is the run status right after the recompute —
 * possibly still `"running"` if sibling tasks haven't reported.
 */
export async function finalizeScrapeRun({
  site,
  payload,
  context,
  collected,
  anyPageExtractionFailed,
  note,
}: {
  site: Site;
  payload: ScrapeSitePayload;
  context: ResolvedScrapeContext;
  collected: CollectedListing[];
  anyPageExtractionFailed: boolean;
  /** Optional operator-facing reason a site contributed nothing — surfaced
   * on {@link RunSiteScrapeResult.note}. */
  note?: string;
}): Promise<RunSiteScrapeResult> {
  let scrapeRunId: string;

  if (payload.scrapeRunId) {
    scrapeRunId = payload.scrapeRunId;
  } else {
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
        // status left at its "running" default — recompute writes it below.
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

  await writeSiteOutcome(db, {
    scrapeRunId,
    site,
    jobConfigId: payload.jobConfigId ?? null,
    outcome:
      anyPageExtractionFailed || collected.length === 0
        ? "empty_extraction"
        : "completed",
    listingCount: collected.length,
  });
  const status = await recomputeAndWriteRunStatus(scrapeRunId);

  return {
    scrapeRunId,
    listingCount: collected.length,
    status,
    anyPageExtractionFailed,
    ...(note ? { note } : {}),
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
 * Side effects beyond {@link finalizeScrapeRun}'s: when the scrape loop
 * throws (selector timeout, navigation failure, `ScrapeMarkupError`,
 * `ScrapeBlockedError`) —
 * - `SiteStatus` (upsert, via `markSiteFailed`): global per-site deactivation.
 * - `ScrapeRunSite` + `ScrapeRun.status` (via {@link recordSiteFailure}):
 *   only when `payload.scrapeRunId` is set — writes this task's row
 *   `outcome: "failed"` + `failureCause`, then recomputes the run status.
 *   The standalone path (no `scrapeRunId`) records nothing here.
 *
 * A single page's extraction returning `[]` is NOT a site failure; it sets
 * `anyPageExtractionFailed`, which {@link finalizeScrapeRun} maps to an
 * `"empty_extraction"` outcome (→ `partial_failure` at the run level).
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
    await recordSiteFailure(site, payload, cause);
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
