import { modelUsedEnum } from "@/drizzle/schema";
import type { ExtractionAdapter, RoleCanonicalizer } from "./adapter";
import { ClaudeHaikuAdapter } from "./claude-haiku";
import { DeepSeekV4FlashAdapter } from "./deepseek-v4-flash";

/** Mirrors `modelUsedEnum`'s persisted values — the only two model choices
 * that exist anywhere in the system (request contract, `ScrapeRun.modelUsed`,
 * this registry). */
export type ModelUsed = (typeof modelUsedEnum.enumValues)[number];

/**
 * The env var each model's adapter reads its API key from. Deliberately
 * scoped to just these two — this is not a general env validator, it is the
 * one pre-flight check that keeps a misconfigured extraction key from
 * surfacing as an upstream 401 mid-run (which escapes the adapter's
 * `console.warn`/`[]` degradation path and crashes the whole `scrape-<site>`
 * task as a Trigger.dev "System failure", leaving `ScrapeRun.status` stuck on
 * `running`).
 */
const REQUIRED_API_KEY_ENV: Record<ModelUsed, string> = {
  claude_haiku: "ANTHROPIC_API_KEY",
  deepseek_v4_flash: "DEEPSEEK_API_KEY",
};

/**
 * Resolves a persisted `modelUsed` value to its adapter — the intersection
 * of {@link ExtractionAdapter} and {@link RoleCanonicalizer}, since both
 * concrete adapters implement both and the direct-API Apec path needs only
 * the latter (CLAUDE.md decision #2 — model choice stays a config switch
 * behind the adapter interface, never a rewrite).
 *
 * Runs at adapter selection (in `runSiteScrape`, before Playwright launches),
 * so a missing/empty key fails fast and legibly here instead of deep inside
 * a provider call.
 *
 * @throws Error if the selected model's key env var
 *   ({@link REQUIRED_API_KEY_ENV}) is unset or empty. Empty specifically
 *   matters for DeepSeek: `@anthropic-ai/sdk` only falls back to
 *   `ANTHROPIC_API_KEY` when `apiKey` is `undefined`, not `""`, so an empty
 *   `DEEPSEEK_API_KEY` is sent verbatim to `api.deepseek.com` and 401s there.
 */
export function getExtractionAdapter(
  model: ModelUsed,
): ExtractionAdapter & RoleCanonicalizer {
  const keyEnv = REQUIRED_API_KEY_ENV[model];
  if (!process.env[keyEnv]) {
    throw new Error(
      `${keyEnv} is unset or empty — it is required to run "${model}" ` +
        `extraction. Set it in .env.local for local dev, or in the Vercel / ` +
        `Trigger.dev environment for deployed runs.`,
    );
  }

  switch (model) {
    case "claude_haiku":
      return new ClaudeHaikuAdapter();
    case "deepseek_v4_flash":
      return new DeepSeekV4FlashAdapter();
  }
}
