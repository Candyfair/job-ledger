import { modelUsedEnum } from "@/drizzle/schema";
import type { ExtractionAdapter } from "./adapter";
import { ClaudeHaikuAdapter } from "./claude-haiku";

/** Mirrors `modelUsedEnum`'s persisted values — the only two model choices
 * that exist anywhere in the system (request contract, `ScrapeRun.modelUsed`,
 * this registry). */
export type ModelUsed = (typeof modelUsedEnum.enumValues)[number];

/**
 * Resolves a persisted `modelUsed` value to its {@link ExtractionAdapter}
 * (CLAUDE.md decision #2 — model choice stays a config switch behind the
 * adapter interface, never a rewrite). `deepseek_v4_flash` is reserved on
 * the enum but has no adapter implementation yet (Session 6) — resolving it
 * throws rather than silently falling back to Haiku, so any caller that
 * bypasses `/api/scrape/trigger`'s own model validation (the Trigger.dev
 * Test tab, a future caller) still fails loudly instead of running the
 * wrong model under the requester's nose.
 */
export function getExtractionAdapter(model: ModelUsed): ExtractionAdapter {
  switch (model) {
    case "claude_haiku":
      return new ClaudeHaikuAdapter();
    case "deepseek_v4_flash":
      throw new Error(
        `Extraction adapter for model "${model}" is not implemented yet`,
      );
  }
}
