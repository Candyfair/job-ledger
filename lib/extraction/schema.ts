import { z } from "zod";

/**
 * The JSON shape every {@link ExtractionAdapter} implementation must produce
 * (Claude Haiku today; DeepSeek from Session 6) — this schema is what a
 * cross-adapter contract test (SPEC.md §8) validates both against.
 */
export const ExtractedListingSchema = z.object({
  listingId: z.string(), // local capture id, never the URL itself
  title: z.string().min(1),
  company: z.string().nullable(),
  companyNormalized: z.string().nullable(),
  roleCanonical: z.string().nullable(),
  datePosted: z.string().nullable(), // ISO 8601 when parseable
  salaryRaw: z.string().nullable(),
});

export const ExtractionResultSchema = z.array(ExtractedListingSchema);
export type ExtractedListing = z.infer<typeof ExtractedListingSchema>;
