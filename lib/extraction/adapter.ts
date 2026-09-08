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

/**
 * Canonical-role classification, split from {@link ExtractionAdapter} because
 * the direct-API Apec path needs only this part of the LLM (its listing
 * fields already arrive structured — SPEC.md §4). Both concrete adapters
 * implement both interfaces; {@link getExtractionAdapter} returns their
 * intersection.
 *
 * `roleCanonical` is the SPEC.md §5 cross-site dedup signal, so it must be
 * produced the same way for every site — a shared model call, never one
 * site on an LLM and another on a hand-written table.
 */
export interface RoleCanonicalizer {
  /**
   * Maps raw job titles to canonical kebab-case role signatures. The result
   * is always exactly `titles.length` long and index-aligned with the
   * input, `null` wherever the model gave nothing usable. Never throws — a
   * refusal, a transport error, or unparseable output all degrade to an
   * all-`null` array, the same posture as
   * {@link ExtractionAdapter.extractListings}'s empty-array failure. An
   * empty `titles` array resolves to `[]` with no API call.
   */
  canonicalizeRoles(titles: string[]): Promise<(string | null)[]>;
}
