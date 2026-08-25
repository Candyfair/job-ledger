import { describe, it, expect } from "vitest";
import { ExtractedListingSchema } from "./schema";

describe("ExtractedListingSchema", () => {
  it("accepts an entry with only title and listingId set, everything else null", () => {
    const result = ExtractedListingSchema.safeParse({
      listingId: "l0",
      title: "Développeur Backend",
      company: null,
      companyNormalized: null,
      roleCanonical: null,
      datePosted: null,
      salaryRaw: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an entry missing title", () => {
    const result = ExtractedListingSchema.safeParse({
      listingId: "l0",
      company: null,
      companyNormalized: null,
      roleCanonical: null,
      datePosted: null,
      salaryRaw: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry with an empty title", () => {
    const result = ExtractedListingSchema.safeParse({
      listingId: "l0",
      title: "",
      company: null,
      companyNormalized: null,
      roleCanonical: null,
      datePosted: null,
      salaryRaw: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an entry missing listingId", () => {
    const result = ExtractedListingSchema.safeParse({
      title: "Développeur Backend",
      company: null,
      companyNormalized: null,
      roleCanonical: null,
      datePosted: null,
      salaryRaw: null,
    });
    expect(result.success).toBe(false);
  });
});
