import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { listing, scrapeRun } from "@/drizzle/schema";
import type { Site } from "@/lib/sites";

export type ListingCursor = { datePosted: string; id: string };

export type ListingDTO = {
  id: string;
  scrapeRunId: string;
  site: Site;
  title: string;
  company: string | null;
  companyNormalized: string | null;
  roleCanonical: string | null;
  datePosted: string | null;
  salaryRaw: string | null;
  url: string;
  excludedByKeyword: string[] | null;
  duplicateOfListingId: string | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

/**
 * Cursor-paginated Listing fetch, sorted newest-posted-first by
 * `datePosted` (SPEC.md §3 — "newest first by datePosted, not scrape-write
 * time"). `datePosted` is ISO-8601 text, not a timestamp column (see
 * drizzle/schema/listing.ts) — its zero-padded format sorts correctly as
 * plain text, so no cast is needed. A null `datePosted` (schema allows it,
 * though SPEC.md §4 says an undateable listing is excluded from its run
 * before ever being persisted) sorts last.
 *
 * Scope is either one run (`runId`) or every run owned by `ownerUserId`
 * ("all time"). Callers must already have verified the caller may see that
 * scope (see `lib/dashboard/run-ownership.ts`'s `getOwnedRun` for the
 * single-run case) before calling this — no ownership check happens here.
 */
export async function getListingsPage({
  runId,
  ownerUserId,
  cursor,
  limit = PAGE_SIZE,
}: {
  runId?: string;
  ownerUserId?: string;
  cursor?: ListingCursor;
  limit?: number;
}): Promise<{ listings: ListingDTO[]; nextCursor: ListingCursor | null }> {
  if (!runId && !ownerUserId) {
    throw new Error("getListingsPage requires either runId or ownerUserId");
  }

  const cursorDatePosted = cursor?.datePosted ?? "";
  const cursorCondition = cursor
    ? or(
        lt(listing.datePosted, cursorDatePosted),
        and(
          eq(listing.datePosted, cursorDatePosted),
          lt(listing.id, cursor.id),
        ),
      )
    : undefined;

  const order = [sql`${listing.datePosted} DESC NULLS LAST`, desc(listing.id)];

  let rows: (typeof listing.$inferSelect)[];

  if (runId) {
    rows = await db
      .select()
      .from(listing)
      .where(
        cursorCondition
          ? and(eq(listing.scrapeRunId, runId), cursorCondition)
          : eq(listing.scrapeRunId, runId),
      )
      .orderBy(...order)
      .limit(limit + 1);
  } else {
    const joined = await db
      .select({ listing })
      .from(listing)
      .innerJoin(scrapeRun, eq(listing.scrapeRunId, scrapeRun.id))
      .where(
        cursorCondition
          ? and(eq(scrapeRun.userId, ownerUserId!), cursorCondition)
          : eq(scrapeRun.userId, ownerUserId!),
      )
      .orderBy(...order)
      .limit(limit + 1);
    rows = joined.map((r) => r.listing);
  }

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    listings: page.map(toListingDTO),
    nextCursor:
      hasMore && last
        ? { datePosted: last.datePosted ?? "", id: last.id }
        : null,
  };
}

function toListingDTO(row: typeof listing.$inferSelect): ListingDTO {
  return {
    id: row.id,
    scrapeRunId: row.scrapeRunId,
    site: row.site,
    title: row.title,
    company: row.company,
    companyNormalized: row.companyNormalized,
    roleCanonical: row.roleCanonical,
    datePosted: row.datePosted,
    salaryRaw: row.salaryRaw,
    url: row.url,
    excludedByKeyword: row.excludedByKeyword,
    duplicateOfListingId: row.duplicateOfListingId,
    createdAt: row.createdAt.toISOString(),
  };
}
