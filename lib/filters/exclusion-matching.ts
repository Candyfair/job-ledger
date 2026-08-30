import { normalize } from "./normalize";
import { tokenize } from "./tokenize";

/**
 * True when `needle` appears as a contiguous, in-order run within
 * `haystack` — used for multi-word keyword phrases, where SPEC.md §5
 * requires the words to appear as a phrase (e.g. "chef de projet"), not
 * merely all present somewhere in the title.
 */
function containsContiguousSubsequence(
  haystack: string[],
  needle: string[],
): boolean {
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, j) => haystack[i + j] === token)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks a listing title against a list of exclusion keywords (SPEC.md §5;
 * feeds `Listing.excludedByKeyword`, DATA_MODEL.md). The title is
 * normalized and tokenized once; each keyword is independently normalized
 * and tokenized, so alias folding, accent-stripping, and connector-
 * character handling apply symmetrically to both sides — this is why
 * matching is done on token arrays, not a raw substring/`includes` check.
 *
 * A single-token keyword must exact-match one of the title's tokens. A
 * multi-token keyword must appear as a contiguous, in-order run of tokens
 * (see {@link containsContiguousSubsequence}) — words present but scattered
 * or reordered do not count. An empty/whitespace-only keyword never
 * matches.
 *
 * Returns the original (un-normalized) keyword strings that matched, in
 * the order given in `keywords` — this is the array persisted verbatim to
 * `Listing.excludedByKeyword` (e.g. `["PHP", "Senior"]`); an empty array
 * means the title is not excluded.
 */
export function matchExclusionKeywords(
  title: string,
  keywords: string[],
): string[] {
  const titleTokens = tokenize(normalize(title));

  return keywords.filter((keyword) => {
    const keywordTokens = tokenize(normalize(keyword));
    if (keywordTokens.length === 0) return false;
    if (keywordTokens.length === 1) {
      return titleTokens.includes(keywordTokens[0]);
    }
    return containsContiguousSubsequence(titleTokens, keywordTokens);
  });
}
