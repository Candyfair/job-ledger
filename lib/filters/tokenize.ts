// Characters kept internal to a token rather than treated as separators
// (SPEC.md §5) — preserves compound tech terms as a single token even
// though they contain punctuation: "Full-Stack", "React/Node", "C++",
// "Node.js". Everything else (whitespace, commas, parentheses, etc.) does
// separate tokens. A run made up only of these characters (e.g. a lone "/"
// surrounded by spaces) is technically still a valid token — harmless here,
// since no real keyword or title fragment reduces to pure punctuation.
const TOKEN_CHARS = /[\p{L}\p{N}\-/+#._]+/gu;

/**
 * Splits already-normalized text (see `normalize.ts`) into tokens on
 * whitespace/punctuation, keeping `- / + # . _` attached to whichever token
 * they're adjacent to (see {@link TOKEN_CHARS}). Does no case-folding or
 * accent-stripping of its own — that's `normalize()`'s job, and running
 * this on raw, un-normalized text will tokenize accented characters and
 * mixed case as-is rather than the canonical form matching requires.
 *
 * Used for both listing titles and exclusion keywords (see
 * `exclusion-matching.ts`), so a keyword and a title fragment that are
 * meant to match must tokenize identically.
 */
export function tokenize(text: string): string[] {
  return text.match(TOKEN_CHARS) ?? [];
}
