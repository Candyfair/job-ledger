import Anthropic from "@anthropic-ai/sdk";
import { ExtractedListingSchema, type ExtractedListing } from "./schema";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserMessage } from "./prompt";
import type { ExtractionAdapter } from "./adapter";

// Reads ANTHROPIC_API_KEY from env, same module-scope pattern as lib/db.ts's
// pool/db client.
const client = new Anthropic();

const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    listings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          listingId: { type: "string" },
          title: { type: "string" },
          company: { type: ["string", "null"] },
          companyNormalized: { type: ["string", "null"] },
          roleCanonical: { type: ["string", "null"] },
          datePosted: { type: ["string", "null"] },
          salaryRaw: { type: ["string", "null"] },
        },
        required: [
          "listingId",
          "title",
          "company",
          "companyNormalized",
          "roleCanonical",
          "datePosted",
          "salaryRaw",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["listings"],
  additionalProperties: false,
} as const;

// Haiku 4.5 has no adaptive thinking / effort support (effort errors on this
// model), so both are omitted entirely — temperature is still accepted on
// this tier and set to 0 for deterministic extraction.
export class ClaudeHaikuAdapter implements ExtractionAdapter {
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
}
