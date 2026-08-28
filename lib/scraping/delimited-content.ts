/**
 * One captured listing card, reduced to what the extraction adapter needs:
 * the local capture id and the raw text blob. The full captured shape (with
 * `url`) lives in each site's scraper; the URL is re-attached after
 * extraction by `mergeListingsWithUrls`, never sent to the LLM (SPEC.md §4).
 */
export interface DelimitedListingInput {
  listingId: string;
  rawText: string;
}

/**
 * Serializes captured cards into the `<<<LISTING id="...">>>`-delimited
 * format the extraction system prompt parses (see `EXTRACTION_SYSTEM_PROMPT`
 * in `/lib/extraction/prompt.ts`). Blocks are separated by a blank line.
 *
 * The `id` is echoed back verbatim by the model and used to re-pair each
 * extracted entry with its Playwright-captured URL — it must round-trip
 * unchanged, so don't interpolate anything that could contain `"`.
 */
export function buildDelimitedContent(
  listings: DelimitedListingInput[],
): string {
  return listings
    .map(
      (l) =>
        `<<<LISTING id="${l.listingId}">>>\n${l.rawText}\n<<<END_LISTING>>>`,
    )
    .join("\n\n");
}
