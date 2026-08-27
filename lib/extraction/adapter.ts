import type { ExtractedListing } from "./schema";

/**
 * Shared contract for every LLM extraction adapter (CLAUDE.md decision #2 —
 * no direct provider SDK calls outside `/lib/extraction`). Generic on
 * purpose: a DeepSeek implementation (Session 6) satisfies this same
 * interface with no signature change, and callers depend only on this
 * interface, never on a specific adapter class.
 *
 * Both adapters must resolve to the same {@link ExtractedListing} shape for
 * the same fixture input — this is the "extraction adapter" scenario in
 * SPEC.md §8 (contract test, mocked responses, never live calls in CI). A
 * page-level parse/refusal failure is reported as an empty array, never a
 * thrown error — callers (see `/trigger`) treat that as a partial-failure
 * signal for the run, not a fatal one.
 */
export interface ExtractionAdapter {
  extractListings(rawContent: string): Promise<ExtractedListing[]>;
}
