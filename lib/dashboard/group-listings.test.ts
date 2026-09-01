import { describe, it, expect } from "vitest";
import { groupListingsByDuplicates, isExcluded } from "./group-listings";
import type { ListingDTO } from "./listing-query";

function makeListing(overrides: Partial<ListingDTO>): ListingDTO {
  return {
    id: "id",
    scrapeRunId: "run-1",
    site: "apec",
    title: "Title",
    company: "Company",
    companyNormalized: null,
    roleCanonical: null,
    datePosted: "2026-08-21",
    salaryRaw: null,
    url: "https://example.com",
    excludedByKeyword: null,
    duplicateOfListingId: null,
    createdAt: "2026-08-21T09:00:00.000Z",
    ...overrides,
  };
}

describe("groupListingsByDuplicates", () => {
  it("groups duplicates under their primary listing", () => {
    const primary = makeListing({ id: "p1" });
    const dup1 = makeListing({ id: "d1", duplicateOfListingId: "p1" });
    const dup2 = makeListing({ id: "d2", duplicateOfListingId: "p1" });
    const other = makeListing({ id: "p2" });

    const groups = groupListingsByDuplicates([primary, dup1, other, dup2]);

    expect(groups).toHaveLength(2);
    expect(groups[0].primary.id).toBe("p1");
    expect(groups[0].duplicates.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(groups[1].primary.id).toBe("p2");
    expect(groups[1].duplicates).toHaveLength(0);
  });

  it("treats a listing whose referenced primary isn't in scope as its own primary", () => {
    const orphanDuplicate = makeListing({
      id: "d1",
      duplicateOfListingId: "not-in-this-page",
    });

    const groups = groupListingsByDuplicates([orphanDuplicate]);

    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("d1");
    expect(groups[0].duplicates).toHaveLength(0);
  });
});

describe("isExcluded", () => {
  it("is false for null or empty excludedByKeyword", () => {
    expect(isExcluded(makeListing({ excludedByKeyword: null }))).toBe(false);
    expect(isExcluded(makeListing({ excludedByKeyword: [] }))).toBe(false);
  });

  it("is true when at least one keyword matched", () => {
    expect(isExcluded(makeListing({ excludedByKeyword: ["PHP"] }))).toBe(true);
  });
});
