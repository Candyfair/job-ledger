import { describe, it, expect } from "vitest";
import { buildApecSearchUrl } from "./apec-url";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";

const LOOKBACK: LookbackWindow = { type: "3d" };

function parse(url: string) {
  return new URL(url);
}

describe("buildApecSearchUrl", () => {
  it("sets the keyword param", () => {
    const url = parse(
      buildApecSearchUrl({
        searchTerm: "développeur react",
        lookback: LOOKBACK,
        page: 0,
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://www.apec.fr/candidat/recherche-emploi.html/emploi",
    );
    expect(url.searchParams.get("motsCles")).toBe("développeur react");
  });

  it("includes the location only when provided", () => {
    expect(
      parse(
        buildApecSearchUrl({ searchTerm: "dev", lookback: LOOKBACK, page: 0 }),
      ).searchParams.has("lieux"),
    ).toBe(false);

    expect(
      parse(
        buildApecSearchUrl({
          searchTerm: "dev",
          location: "Paris",
          lookback: LOOKBACK,
          page: 0,
        }),
      ).searchParams.get("lieux"),
    ).toBe("Paris");
  });

  it("omits page for page 0 and sets it (0-indexed) from page 1 on", () => {
    expect(
      parse(
        buildApecSearchUrl({ searchTerm: "dev", lookback: LOOKBACK, page: 0 }),
      ).searchParams.has("page"),
    ).toBe(false);

    expect(
      parse(
        buildApecSearchUrl({ searchTerm: "dev", lookback: LOOKBACK, page: 3 }),
      ).searchParams.get("page"),
    ).toBe("3");
  });

  it("pins the four typesConvention params that exclude partner-site listings (SPEC §2)", () => {
    const url = parse(
      buildApecSearchUrl({ searchTerm: "dev", lookback: LOOKBACK, page: 0 }),
    );
    expect(url.searchParams.getAll("typesConvention")).toEqual([
      "143684",
      "143685",
      "143686",
      "143687",
    ]);
  });

  it("ignores the lookback window (no Apec query param for it)", () => {
    const a = buildApecSearchUrl({
      searchTerm: "dev",
      lookback: { type: "24h" },
      page: 0,
    });
    const b = buildApecSearchUrl({
      searchTerm: "dev",
      lookback: { type: "since_date", since: new Date("2026-01-01") },
      page: 0,
    });
    expect(a).toBe(b);
  });
});
