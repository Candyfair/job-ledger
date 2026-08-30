import { modelUsedEnum } from "@/drizzle/schema";
import type { ExtractionAdapter } from "./adapter";
import { ClaudeHaikuAdapter } from "./claude-haiku";
import { DeepSeekV4FlashAdapter } from "./deepseek-v4-flash";

/** Mirrors `modelUsedEnum`'s persisted values — the only two model choices
 * that exist anywhere in the system (request contract, `ScrapeRun.modelUsed`,
 * this registry). */
export type ModelUsed = (typeof modelUsedEnum.enumValues)[number];

/**
 * Resolves a persisted `modelUsed` value to its {@link ExtractionAdapter}
 * (CLAUDE.md decision #2 — model choice stays a config switch behind the
 * adapter interface, never a rewrite).
 */
export function getExtractionAdapter(model: ModelUsed): ExtractionAdapter {
  switch (model) {
    case "claude_haiku":
      return new ClaudeHaikuAdapter();
    case "deepseek_v4_flash":
      return new DeepSeekV4FlashAdapter();
  }
}
