import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
  // JSDoc Tier 1 / Tier 2 enforcement (CLAUDE.md — Documentation (JSDoc)).
  // Scoped to these globs only, never project-wide, so trivial code doesn't
  // get incentivized toward empty boilerplate JSDoc.
  {
    files: [
      "lib/filters/**",
      "lib/dedup/**",
      "lib/extraction/**",
      "lib/scraping/**",
      "trigger/**",
      "app/api/**",
    ],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: true },
        },
      ],
    },
  },
  // Must stay last: disables stylistic rules that would conflict with Prettier.
  eslintConfigPrettier,
]);

export default eslintConfig;
