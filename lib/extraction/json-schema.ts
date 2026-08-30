/**
 * JSON Schema for the extraction output shape, shared by every
 * {@link ExtractionAdapter} implementation (Claude Haiku's native
 * `output_config.format: json_schema`, DeepSeek's forced tool-use
 * `input_schema`) so the two can't silently drift apart. Mirrors
 * {@link ExtractedListingSchema} in `./schema.ts` field-for-field — that
 * Zod schema is the actual runtime validation gate; this is only what each
 * provider is told to produce.
 */
export const EXTRACTION_JSON_SCHEMA = {
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
