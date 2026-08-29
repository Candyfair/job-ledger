/**
 * Framework/library names that commonly appear with a ".js" suffix in job
 * titles (e.g. "React.js", "Vue.js", "Node.js", "VueJS"). Used to build
 * {@link jsFrameworkSuffixPattern} below.
 */
const JS_FRAMEWORK_NAMES = [
  "react",
  "vue",
  "angular",
  "ember",
  "backbone",
  "next",
  "nuxt",
  "node",
  "nest",
  "express",
  "meteor",
  "three",
  "d3",
  "chart",
] as const;

/**
 * Matches "<name>.js" or "<name>js" (the dot is optional) for any name in
 * {@link JS_FRAMEWORK_NAMES}, so "Vue.js", "VueJS", and "vuejs" all fold to
 * the bare framework name via `KEYWORD_ALIASES`' `canonical: "$1"`.
 *
 * Must be declared before `KEYWORD_ALIASES` (as it is here) — an earlier
 * draft declared it after, which breaks at module-eval time: `const`
 * bindings are hoisted but left in the temporal dead zone until their
 * declaration runs, so `KEYWORD_ALIASES` referencing `jsFrameworkSuffixPattern`
 * before it's initialized throws a `ReferenceError`.
 */
const jsFrameworkSuffixPattern = new RegExp(
  `\\b(${JS_FRAMEWORK_NAMES.join("|")})\\.?js\\b`,
  "gi",
);

/**
 * Known spelling/formatting variants folded to one canonical form before
 * tokenization (SPEC.md §5), e.g. "full-stack" / "full stack" / "fullstack"
 * → "fullstack". Applied to both listing titles and exclusion keywords (see
 * `normalize.ts`) so either side can be written in any variant and still
 * match. Deliberately narrow at launch — extended incrementally as new
 * cases surface, not an attempt at exhaustive coverage.
 */
export const KEYWORD_ALIASES: { pattern: RegExp; canonical: string }[] = [
  { pattern: /\bfull[\s-]?stack\b/gi, canonical: "fullstack" },
  { pattern: /\bfront[\s-]?end\b/gi, canonical: "frontend" },
  { pattern: /\bback[\s-]?end\b/gi, canonical: "backend" },
  { pattern: /\blow[\s-]?code\b/gi, canonical: "lowcode" },
  { pattern: /\btech[\s-]?lead\b/gi, canonical: "lead" },
  { pattern: jsFrameworkSuffixPattern, canonical: "$1" },
];
