import { describe, it, expect, vi, afterEach } from "vitest";
import { mergeListingsWithUrls } from "./merge-listings";
import type { ExtractedListing } from "./schema";

function makeListing(
  overrides: Partial<ExtractedListing> = {},
): ExtractedListing {
  return {
    listingId: "l0",
    title: "Développeur Backend",
    company: null,
    companyNormalized: null,
    roleCanonical: null,
    datePosted: null,
    salaryRaw: null,
    ...overrides,
  };
}

describe("mergeListingsWithUrls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-attaches the correct captured URL by matching listingId", () => {
    const extracted = [
      makeListing({ listingId: "l0" }),
      makeListing({ listingId: "l1", title: "Développeur Frontend" }),
    ];
    const captured = [
      { listingId: "l1", url: "https://fr.indeed.com/l1" },
      { listingId: "l0", url: "https://fr.indeed.com/l0" },
    ];

    const merged = mergeListingsWithUrls(extracted, captured);

    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.listingId === "l0")?.url).toBe(
      "https://fr.indeed.com/l0",
    );
    expect(merged.find((m) => m.listingId === "l1")?.url).toBe(
      "https://fr.indeed.com/l1",
    );
  });

  it("drops an extracted entry with no matching captured URL, with a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const extracted = [makeListing({ listingId: "unknown" })];
    const captured = [{ listingId: "l0", url: "https://fr.indeed.com/l0" }];

    const merged = mergeListingsWithUrls(extracted, captured);

    expect(merged).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});
