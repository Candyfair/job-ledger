import type { InferSelectModel } from "drizzle-orm";
import { SITE_LABELS, SITE_CODES, type Site } from "@/lib/sites";
import type { listing, scrapeRun, scrapeRunSite } from "@/drizzle/schema";
import {
  combineSiteOutcome,
  type Outcome,
  type ScrapeRunStatus,
} from "@/lib/run-status";
import type { SiteFailureCause } from "@/lib/scraping/errors";

type ScrapeRunRow = InferSelectModel<typeof scrapeRun>;
type ListingRow = InferSelectModel<typeof listing>;
type ScrapeRunSiteRow = InferSelectModel<typeof scrapeRunSite>;

export type SiteRunStatus = {
  site: Site;
  label: string;
  code: string;
  /** The tier-1 combined outcome for this site — `combineSiteOutcome` across
   * the run's `JobConfig` rows for it. Widened from the old
   * `pending | completed | failed` to the full `ScrapeRunSite` outcome set;
   * user-facing copy for `empty_extraction` / `skipped` is deferred to the
   * navigation/banner session. */
  status: Outcome;
  failureCause: SiteFailureCause | null;
  listingCount: number;
};

export type RunStatusPayload = {
  runId: string;
  /** Read straight from the persisted `ScrapeRun.status` — the run-status
   * rollup (SPEC.md §4) keeps it current; this is no longer derived on read. */
  status: ScrapeRunStatus;
  triggeredAt: string;
  model: ScrapeRunRow["modelUsed"];
  sitesIncluded: Site[];
  sites: SiteRunStatus[];
  kept: number;
  excluded: number;
  duplicateGroups: number;
};

/**
 * Builds the `GET /api/scrape/status/:runId` payload (SPEC.md §7) for one run
 * from already-fetched rows — the shared shape used by both `app/page.tsx`
 * (SSR initial paint), the status endpoint (client polling), and
 * `lib/dashboard/run-history.ts` (the authenticated run-history strip), so
 * none of them can disagree.
 *
 * `status` is the persisted `ScrapeRun.status` verbatim. Per-site `status` is
 * the tier-1 {@link combineSiteOutcome} across that site's `ScrapeRunSite`
 * rows; `failureCause` is taken from the first `failed` row that carries one;
 * `listingCount` is summed from the persisted `ScrapeRunSite.listingCount`
 * (written by each task at finalize time), not recomputed from `Listing`.
 *
 * Pre-rollout runs have no `ScrapeRunSite` rows: such a site falls back to
 * `status: "pending"` and a live `Listing` count. `kept` / `excluded` /
 * `duplicateGroups` are always derived from `listings`.
 *
 * Pure — no I/O.
 */
export function assembleRunStatus({
  run,
  siteRows,
  listings,
}: {
  run: Pick<
    ScrapeRunRow,
    "id" | "triggeredAt" | "modelUsed" | "sitesIncluded" | "status"
  >;
  siteRows: Pick<
    ScrapeRunSiteRow,
    "site" | "outcome" | "failureCause" | "listingCount"
  >[];
  listings: Pick<
    ListingRow,
    "site" | "excludedByKeyword" | "duplicateOfListingId"
  >[];
}): RunStatusPayload {
  const kept = listings.filter(
    (l) => !l.excludedByKeyword || l.excludedByKeyword.length === 0,
  ).length;
  const excluded = listings.length - kept;

  const duplicateGroups = new Set(
    listings
      .map((l) => l.duplicateOfListingId)
      .filter((id): id is string => id !== null),
  ).size;

  const sites: SiteRunStatus[] = run.sitesIncluded.map((site) => {
    const rows = siteRows.filter((r) => r.site === site);
    const status: Outcome =
      rows.length > 0
        ? combineSiteOutcome(rows.map((r) => r.outcome))
        : "pending";
    const failureCause =
      rows.find((r) => r.outcome === "failed" && r.failureCause !== null)
        ?.failureCause ?? null;
    const listingCount =
      rows.length > 0
        ? rows.reduce((sum, r) => sum + r.listingCount, 0)
        : listings.filter((l) => l.site === site).length;

    return {
      site,
      label: SITE_LABELS[site],
      code: SITE_CODES[site],
      status,
      failureCause,
      listingCount,
    };
  });

  return {
    runId: run.id,
    status: run.status,
    triggeredAt: run.triggeredAt.toISOString(),
    model: run.modelUsed,
    sitesIncluded: run.sitesIncluded,
    sites,
    kept,
    excluded,
    duplicateGroups,
  };
}
