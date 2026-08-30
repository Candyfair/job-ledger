import Anthropic from "@anthropic-ai/sdk";
import { ExtractedListingSchema, type ExtractedListing } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserMessage } from "./prompt";
import type { ExtractionAdapter } from "./adapter";
import { EXTRACTION_JSON_SCHEMA } from "./json-schema";

const SUBMIT_LISTINGS_TOOL = "submit_listings";

// Own client instance, deliberately never shared with claude-haiku.ts's
// module-scope `client`: separate baseURL AND separate API key. Both
// adapters now use the same SDK package, so reusing Haiku's client here
// would be a silent copy-paste bug that only a constructor-call assertion
// (see deepseek-v4-flash.test.ts) — not a return-shape check — would catch.
const client = new Anthropic({
  baseURL: "https://api.deepseek.com/anthropic",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

/**
 * DeepSeek V4 Flash implementation of {@link ExtractionAdapter}. Must return
 * the same JSON shape as {@link ClaudeHaikuAdapter} for the same fixture
 * input — SPEC.md §8's extraction adapter contract test.
 *
 * Structural divergence from Haiku, and why: DeepSeek's Anthropic-compatible
 * endpoint (`api-docs.deepseek.com/guides/anthropic_api/`) only supports the
 * `effort` sub-field of `output_config`, not arbitrary `json_schema` format —
 * so this adapter can't use Haiku's native-structured-output mechanism.
 * Instead it forces a tool call (`tool_choice: { type: "tool" }`) with
 * {@link EXTRACTION_JSON_SCHEMA} as the tool's `input_schema`. Tool-use is
 * schema-*guided*, not schema-*enforced* the same way native structured
 * outputs are, so unlike Haiku this adapter can also fail a whole batch by
 * simply not calling the tool — a failure mode Haiku's mechanism structurally
 * can't have. The per-item Zod drop-loop below is otherwise identical to
 * Haiku's.
 *
 * Thinking mode: disabled via `thinking: { type: "disabled" }`, matching
 * Haiku's deterministic posture (extraction is structured restructuring of
 * already-visible content, not open-ended reasoning). Verified live against
 * the real DeepSeek API on 2026-08-30 — DeepSeek's own doc pages disagreed
 * on the mechanism (some suggested an `output_config.effort` sub-field), but
 * `output_config: { effort: "none" }` is rejected outright by the live API
 * (400: `effort` only accepts `low`/`medium`/`high`/`xhigh`/`ultra`/`max`,
 * no "none"/off value) — `output_config.effort` controls reasoning *depth*
 * when thinking is on, not whether it's on. `thinking: { type: "disabled" }`
 * (the same top-level field Claude itself uses for extended thinking) is
 * the actual switch: confirmed the response then contains no `thinking`
 * content block, and that this combines cleanly with the forced tool call
 * below (response is a single `tool_use` block, `stop_reason: "tool_use"`).
 */
export class DeepSeekV4FlashAdapter implements ExtractionAdapter {
  /**
   * Structures raw delimited listing text into {@link ExtractedListing}s.
   * Never throws on a model-side failure (refusal, `max_tokens` cutoff, no
   * matching tool_use block, unparseable tool input, or an
   * individually-invalid listing entry) — each case is logged via
   * `console.warn` and degrades to dropping that listing (or returning `[]`
   * for a whole-batch failure), leaving the caller to treat the run as a
   * partial success rather than aborting it.
   */
  async extractListings(rawContent: string): Promise<ExtractedListing[]> {
    const referenceDate = new Date().toISOString().slice(0, 10);

    const response = await client.messages.create({
      model: "deepseek-v4-flash",
      max_tokens: 4096,
      temperature: 0,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildExtractionUserMessage(referenceDate, rawContent),
        },
      ],
      thinking: { type: "disabled" },
      tools: [
        {
          name: SUBMIT_LISTINGS_TOOL,
          description:
            "Submit the structured listings extracted from the raw content.",
          // Cast: EXTRACTION_JSON_SCHEMA's `as const` gives `required` a
          // readonly tuple type; Tool.InputSchema expects a mutable
          // string[]. Structurally identical at runtime.
          input_schema:
            EXTRACTION_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: SUBMIT_LISTINGS_TOOL },
    });

    if (
      response.stop_reason === "refusal" ||
      response.stop_reason === "max_tokens"
    ) {
      console.warn(
        `DeepSeek V4 Flash extraction failed for this batch: stop_reason=${response.stop_reason}`,
      );
      return [];
    }

    const toolUseBlock = response.content.find(
      (block) =>
        block.type === "tool_use" && block.name === SUBMIT_LISTINGS_TOOL,
    );
    if (!toolUseBlock) {
      console.warn(
        `DeepSeek V4 Flash did not call ${SUBMIT_LISTINGS_TOOL} for this batch`,
      );
      return [];
    }

    const rawListings =
      (toolUseBlock as { input?: { listings?: unknown[] } }).input?.listings ??
      [];
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
}
