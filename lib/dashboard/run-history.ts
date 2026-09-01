import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun, listing, siteStatus } from "@/drizzle/schema";
import {
  deriveRunStatus,
  type RunStatusPayload,
} from "@/lib/dashboard/derive-run-status";

export type RunHistoryCursor = { triggeredAt: string; id: string };
export type RunHistoryEntry = RunStatusPayload;

const PAGE_SIZE = 20;

/**
 * Cursor-paginated run-history strip entries for a user's own runs, newest
 * first (SPEC.md §3 — the authenticated dashboard's run-history strip). This
 * is the first pagination pattern in this codebase — no prior convention
 * existed to reuse (every other DB read in the app is unbounded). Cursor-
 * based on `(triggeredAt, id)` rather than offset, since a new run can be
 * triggered live while a user is scrolled into a later page, which would
 * shift/duplicate rows under plain LIMIT/OFFSET.
 */
export async function getRunHistory({
  userId,
  cursor,
  limit = PAGE_SIZE,
}: {
  userId: string;
  cursor?: RunHistoryCursor;
  limit?: number;
}): Promise<{ runs: RunHistoryEntry[]; nextCursor: RunHistoryCursor | null }> {
  const cursorCondition = cursor
    ? or(
        lt(scrapeRun.triggeredAt, new Date(cursor.triggeredAt)),
        and(
          eq(scrapeRun.triggeredAt, new Date(cursor.triggeredAt)),
          lt(scrapeRun.id, cursor.id),
        ),
      )
    : undefined;

  const rows = await db
    .select()
    .from(scrapeRun)
    .where(
      cursorCondition
        ? and(eq(scrapeRun.userId, userId), cursorCondition)
        : eq(scrapeRun.userId, userId),
    )
    .orderBy(desc(scrapeRun.triggeredAt), desc(scrapeRun.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  if (page.length === 0) {
    return { runs: [], nextCursor: null };
  }

  const runIds = page.map((r) => r.id);
  const allSites = [...new Set(page.flatMap((r) => r.sitesIncluded))];

  const [allListings, statuses] = await Promise.all([
    db.select().from(listing).where(inArray(listing.scrapeRunId, runIds)),
    allSites.length > 0
      ? db.select().from(siteStatus).where(inArray(siteStatus.site, allSites))
      : Promise.resolve([]),
  ]);

  const runs = page.map((run) =>
    deriveRunStatus({
      run,
      listings: allListings.filter((l) => l.scrapeRunId === run.id),
      siteStatuses: statuses,
    }),
  );

  const last = page[page.length - 1];
  return {
    runs,
    nextCursor: hasMore
      ? { triggeredAt: last.triggeredAt.toISOString(), id: last.id }
      : null,
  };
}
