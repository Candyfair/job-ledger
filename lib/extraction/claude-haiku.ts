import Anthropic from "@anthropic-ai/sdk";
import { ExtractedListingSchema, type ExtractedListing } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserMessage } from "./prompt";
import type { ExtractionAdapter, RoleCanonicalizer } from "./adapter";
import { EXTRACTION_JSON_SCHEMA } from "./json-schema";
import {
  ROLE_CANONICAL_SYSTEM_PROMPT,
  ROLE_CANONICAL_JSON_SCHEMA,
  buildRoleCanonicalUserMessage,
  alignRolesToTitles,
} from "./roles-prompt";

// Reads ANTHROPIC_API_KEY from env, same module-scope pattern as lib/db.ts's
// pool/db client.
const client = new Anthropic();

/**
 * Claude Haiku implementation of {@link ExtractionAdapter}. Must return the
 * same JSON shape as any other adapter (e.g. the future DeepSeek one) for
 * the same fixture input — see SPEC.md §8's extraction adapter contract
 * test. Haiku 4.5 has no adaptive thinking / effort support (effort errors
 * on this model), so both are omitted entirely — temperature is still
 * accepted on this tier and set to 0 for deterministic extraction.
 */
export class ClaudeHaikuAdapter
  implements ExtractionAdapter, RoleCanonicalizer
{
  /**
   * Structures raw delimited listing text into {@link ExtractedListing}s.
   * Never throws on a model-side failure (refusal, `max_tokens` cutoff,
   * unparseable JSON, or an individually-invalid listing entry) — each case
   * is logged via `console.warn` and degrades to dropping that listing (or
   * returning `[]` for a whole-batch failure), leaving the caller to treat
   * the run as a partial success rather than aborting it.
   */
  async extractListings(rawContent: string): Promise<ExtractedListing[]> {
    const referenceDate = new Date().toISOString().slice(0, 10);

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      temperature: 0,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildExtractionUserMessage(referenceDate, rawContent),
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA },
      },
    });

    if (
      response.stop_reason === "refusal" ||
      response.stop_reason === "max_tokens"
    ) {
      console.warn(
        `Claude Haiku extraction failed for this batch: stop_reason=${response.stop_reason}`,
      );
      return [];
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock) {
      console.warn("Claude Haiku returned no text block for this batch");
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      console.warn("Claude Haiku returned unparseable JSON for this batch");
      return [];
    }

    const rawListings = (parsed as { listings?: unknown[] }).listings ?? [];
    const validListings: ExtractedListing[] = [];
    for (const raw of rawListings) {
      const result = ExtractedListingSchema.safeParse(raw);
      if (result.success) {
        validListings.push(result.data);
      } else {
        console.warn(
          "Dropping individually-invalid listing entry:",
          result.error.message,
          raw,
        );
      }
    }
    return validListings;
  }

  /**
   * Classifies raw titles into canonical role signatures. Same never-throw
   * contract as {@link extractListings}: a refusal, an empty response, a
   * transport error, or unparseable JSON all resolve to an all-`null` array
   * of the right length, logged via `console.warn`.
   */
  async canonicalizeRoles(titles: string[]): Promise<(string | null)[]> {
    if (titles.length === 0) return [];
    const allNull = () => titles.map(() => null);

    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        temperature: 0,
        system: ROLE_CANONICAL_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildRoleCanonicalUserMessage(titles) },
        ],
        output_config: {
          format: { type: "json_schema", schema: ROLE_CANONICAL_JSON_SCHEMA },
        },
      });

      if (
        response.stop_reason === "refusal" ||
        response.stop_reason === "max_tokens"
      ) {
        console.warn(
          `Claude Haiku role canonicalization failed: stop_reason=${response.stop_reason}`,
        );
        return allNull();
      }

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock) {
        console.warn(
          "Claude Haiku returned no text block for role canonicalization",
        );
        return allNull();
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        console.warn(
          "Claude Haiku returned unparseable JSON for role canonicalization",
        );
        return allNull();
      }

      return alignRolesToTitles(titles.length, parsed);
    } catch (error) {
      console.warn("Claude Haiku role canonicalization threw:", error);
      return allNull();
    }
  }
}
