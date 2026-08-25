import { z } from "zod";

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
