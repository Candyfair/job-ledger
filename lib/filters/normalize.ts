import { KEYWORD_ALIASES } from "./keyword-aliases";

/**
 * Folds known spelling/formatting variants to their canonical form by
 * applying every {@link KEYWORD_ALIASES} pattern in sequence (SPEC.md §5).
 * Exported separately from {@link normalize} so alias behavior can be
 * asserted in isolation from accent-stripping/casing.
 */
export function normalizeVariants(text: string): string {
  return KEYWORD_ALIASES.reduce(
    (acc, { pattern, canonical }) => acc.replace(pattern, canonical),
    text,
  );
}

/**
 * Strips combining diacritical marks after Unicode NFD decomposition, e.g.
 * "développeur" → "developpeur" (SPEC.md §5 — accent-insensitive matching).
 * Not exported: always run as part of the {@link normalize} pipeline, never
 * standalone.
 */
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Full pre-tokenization normalization pipeline for exclusion matching
 * (SPEC.md §5): fold known spelling variants, strip accents, then
 * lowercase — in that order. Variant folding runs first because
 * {@link KEYWORD_ALIASES} patterns are written against un-decomposed,
 * mixed-case input (they rely on `\b` word boundaries and the `i` flag,
 * not on any prior normalization); running accent-stripping or lowercasing
 * first would still work for the current alias list (none target accented
 * text) but isn't guaranteed to for future entries, so the order is fixed
 * here rather than left to call-site assumption.
 *
 * Call on both the listing title and each exclusion keyword before
 * tokenizing (see `tokenize.ts`) — matching only works when both sides went
 * through the same pipeline.
 */
export function normalize(text: string): string {
  return stripAccents(normalizeVariants(text)).toLowerCase();
}
