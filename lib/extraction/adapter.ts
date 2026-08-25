import type { ExtractedListing } from "./schema";

// Generic on purpose: a DeepSeek implementation (Session 6) satisfies this
// same interface with no signature change, and callers depend only on this
// interface, never on a specific adapter class — CLAUDE.md decision #2.
export interface ExtractionAdapter {
  extractListings(rawContent: string): Promise<ExtractedListing[]>;
}
