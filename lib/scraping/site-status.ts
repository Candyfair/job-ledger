import { db } from "@/lib/db";
import { siteStatus } from "@/drizzle/schema";
import type { Site } from "@/lib/sites";
import type { SiteFailureCause } from "./errors";

/**
 * Records a site-wide scraper failure on `SiteStatus` (SPEC.md §5,
 * DATA_MODEL.md). Upserts on `site` — the row may not exist yet (a missing
 * row means "never scraped", not "healthy") — flipping `active` to `false`
 * globally and stamping the cause + message. Deactivation is not reversed
 * here: re-enabling is a manual action on the settings page, since a markup
 * break or a block affects every user and every job config until someone
 * looks at it.
 *
 * Called from {@link runSiteScrape}'s catch block only. A page's extraction
 * coming back empty is NOT a site failure and must not reach this — that's a
 * per-run `partial_failure`, not a global deactivation.
 */
export async function markSiteFailed(
  site: Site,
  cause: SiteFailureCause,
  note: string,
): Promise<void> {
  const failure = {
    active: false as const,
    lastErrorAt: new Date(),
    lastErrorNote: note,
    lastFailureCause: cause,
  };
  await db
    .insert(siteStatus)
    .values({ site, ...failure })
    .onConflictDoUpdate({ target: siteStatus.site, set: failure });
}
