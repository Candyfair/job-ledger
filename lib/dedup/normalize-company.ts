/**
 * French legal-form suffixes stripped from a company name before comparison.
 * Order matters only in that longer forms are listed first for readability;
 * matching is whole-token and case-insensitive (the input is already
 * lower-cased and de-accented by the time these apply). Kept as a typed data
 * constant per CLAUDE.md's convention for static, config-shaped content.
 *
 * Mirrors the list the extraction prompt names for the LLM path
 * (`lib/extraction/prompt.ts`) so Apec (deterministic, here) and HelloWork
 * (LLM) produce the same `companyNormalized` for the same employer —
 * SPEC.md §5 cross-site dedup depends on that symmetry.
 */
const LEGAL_FORM_SUFFIXES = ["sasu", "sarl", "eurl", "sas", "sa"] as const;

// Combining diacritical marks, removed after NFD decomposition — same
// technique as lib/filters/normalize.ts.
const DIACRITICS = /[̀-ͯ]/g;
const WHITESPACE_RUN = /\s+/g;

/**
 * Reduces a raw company name to the mechanical, judgment-free normalized
 * form used for duplicate detection (SPEC.md §5): lower-case, strip
 * accents/diacritics, drop trailing French legal-form suffixes
 * ({@link LEGAL_FORM_SUFFIXES}), collapse internal whitespace, trim.
 *
 * Deterministic and pure — CLAUDE.md decision #1 (this is a transform, not a
 * judgment call, so it is code, not an LLM output). Callers must pass a real
 * string; a `null`/absent company stays `null` upstream and never reaches
 * here.
 *
 * Examples (from the extraction prompt's own list):
 * - `"Doctolib SAS"` → `"doctolib"`
 * - `"BLABLACAR SA"` → `"blablacar"`
 * - `"Petite Boîte SARL"` → `"petite boite"`
 *
 * Trailing suffixes are stripped repeatedly (`"Machin SARL SA"` → `"machin"`);
 * a name that is *only* a legal form (`"SA"`) normalizes to `""` — the caller
 * treats an empty result the same as no signal.
 */
export function normalizeCompany(raw: string): string {
  let value = raw
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(WHITESPACE_RUN, " ")
    .trim();

  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of LEGAL_FORM_SUFFIXES) {
      if (value === suffix) {
        return "";
      }
      if (value.endsWith(` ${suffix}`)) {
        value = value.slice(0, -(suffix.length + 1)).trimEnd();
        stripped = true;
      }
    }
  }

  return value;
}
