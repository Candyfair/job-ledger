import type { InferSelectModel } from "drizzle-orm";
import { SITE_LABELS, SITE_CODES, type Site } from "@/lib/sites";
import type { listing, scrapeRun, siteStatus } from "@/drizzle/schema";

type ScrapeRunRow = InferSelectModel<typeof scrapeRun>;
type ListingRow = InferSelectModel<typeof listing>;
type SiteStatusRow = InferSelectModel<typeof siteStatus>;

export type SiteRunStatus = {
  site: Site;
  label: string;
  code: string;
  status: "pending" | "completed" | "failed";
  failureCause: SiteStatusRow["lastFailureCause"];
  listingCount: number;
};

export type RunStatusPayload = {
  runId: string;
  status: "running" | "completed" | "partial_failure";
  statusBasis: "derived";
  triggeredAt: string;
  model: ScrapeRunRow["modelUsed"];
  sitesIncluded: Site[];
  sites: SiteRunStatus[];
  kept: number;
  excluded: number;
  duplicateGroups: number;
};

const STALE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Derives a run's overall status live from its Listing rows + the global
 * SiteStatus table. Nothing in this codebase currently persists
 * `ScrapeRun.status` past its `"running"` default — no rollup writer exists
 * on the production multi-site fan-out path (see SPEC.md §9) — so this is a
 * heuristic read, not a stored fact, surfaced to callers as
 * `statusBasis: "derived"`.
 *
 * Known blind spots (SPEC.md §9), not silently glossed over:
 * - A page whose LLM extraction came back empty with no Playwright error and
 *   no SiteStatus flip is a real `partial_failure` per SPEC.md §4/§5, but
 *   that signal is only ever recorded in-memory on the single-site
 *   standalone scrape path — nothing persists it for the production
 *   multi-site fan-out path this heuristic reads from. Such a run reads as
 *   "completed" here.
 * - `SiteStatus` is a GLOBAL singleton per site, not per-run. Attributing a
 *   failure to "this run" via `lastErrorAt >= run.triggeredAt` can
 *   misattribute a failure between two runs that both target the same site
 *   close together in time.
 * - `STALE_TIMEOUT_MS` (10 minutes) is a guessed constant — no typical
 *   run-duration figure exists anywhere in SPEC.md/DEPLOYMENT.md to derive
 *   it from.
 */
export function deriveRunStatus({
  run,
  listings,
  siteStatuses,
  now = new Date(),
}: {
  run: Pick<ScrapeRunRow, "id" | "triggeredAt" | "modelUsed" | "sitesIncluded">;
  listings: Pick<
    ListingRow,
    "site" | "excludedByKeyword" | "duplicateOfListingId"
  >[];
  siteStatuses: Pick<
    SiteStatusRow,
    "site" | "active" | "lastErrorAt" | "lastFailureCause"
  >[];
  now?: Date;
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
    const listingCount = listings.filter((l) => l.site === site).length;
    const globalStatus = siteStatuses.find((s) => s.site === site);
    const failedDuringThisRun =
      globalStatus !== undefined &&
      !globalStatus.active &&
      globalStatus.lastErrorAt !== null &&
      globalStatus.lastErrorAt.getTime() >= run.triggeredAt.getTime();

    return {
      site,
      label: SITE_LABELS[site],
      code: SITE_CODES[site],
      status: failedDuringThisRun
        ? "failed"
        : listingCount > 0
          ? "completed"
          : "pending",
      failureCause: failedDuringThisRun ? globalStatus.lastFailureCause : null,
      listingCount,
    };
  });

  const allResolved = sites.every((s) => s.status !== "pending");
  const anyFailed = sites.some((s) => s.status === "failed");
  const isStale = now.getTime() - run.triggeredAt.getTime() > STALE_TIMEOUT_MS;

  const status: RunStatusPayload["status"] =
    allResolved || isStale
      ? anyFailed
        ? "partial_failure"
        : "completed"
      : "running";

  return {
    runId: run.id,
    status,
    statusBasis: "derived",
    triggeredAt: run.triggeredAt.toISOString(),
    model: run.modelUsed,
    sitesIncluded: run.sitesIncluded,
    sites,
    kept,
    excluded,
    duplicateGroups,
  };
}
