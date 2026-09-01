import type { ListingDTO } from "@/lib/dashboard/listing-query";

export type ListingGroup = { primary: ListingDTO; duplicates: ListingDTO[] };

/**
 * Groups a listing list by `duplicateOfListingId` (SPEC.md §5 — nothing is
 * deleted, duplicates are grouped/flagged). A listing whose referenced
 * primary isn't present in `listings` (out of the current page/scope, or
 * filtered out by exclusion mode) is treated as its own primary rather than
 * silently dropped. Preserves the input's order for primaries.
 */
export function groupListingsByDuplicates(
  listings: ListingDTO[],
): ListingGroup[] {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const duplicatesByPrimary = new Map<string, ListingDTO[]>();
  const primaries: ListingDTO[] = [];

  for (const l of listings) {
    const primaryId = l.duplicateOfListingId;
    if (primaryId && byId.has(primaryId)) {
      const group = duplicatesByPrimary.get(primaryId) ?? [];
      group.push(l);
      duplicatesByPrimary.set(primaryId, group);
    } else {
      primaries.push(l);
    }
  }

  return primaries.map((primary) => ({
    primary,
    duplicates: duplicatesByPrimary.get(primary.id) ?? [],
  }));
}

export function isExcluded(listing: ListingDTO): boolean {
  return (listing.excludedByKeyword?.length ?? 0) > 0;
}
