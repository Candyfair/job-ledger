import type { ExtractedListing } from "./schema";

export interface CapturedListing {
  listingId: string;
  url: string;
}

export interface ListingWithUrl extends ExtractedListing {
  url: string;
}

/**
 * The LLM never sees or produces a real URL (SPEC.md §4) — this re-attaches
 * the Playwright-captured href by matching on the local `listingId`. An
 * extracted entry with no matching captured URL is silently dropped (logged
 * via `console.warn`), never written with an empty `url` — `Listing.url` is
 * `NOT NULL` in the schema.
 */
export function mergeListingsWithUrls(
  extracted: ExtractedListing[],
  captured: CapturedListing[],
): ListingWithUrl[] {
  const urlById = new Map(captured.map((c) => [c.listingId, c.url]));
  const merged: ListingWithUrl[] = [];
  for (const item of extracted) {
    const url = urlById.get(item.listingId);
    if (!url) {
      console.warn(
        `No captured URL for listingId ${item.listingId} — dropping`,
      );
      continue;
    }
    merged.push({ ...item, url });
  }
  return merged;
}
