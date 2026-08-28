import { describe, it, expect } from "vitest";
import { buildHelloworkSearchUrl } from "./hellowork-url";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";

const LOOKBACK: LookbackWindow = { type: "3d" };

function parse(url: string) {
  return new URL(url);
}

// NOTE: these assertions pin the CURRENT scaffolded param names, which are
// UNVERIFIED (see hellowork-url.ts header). When the live shape is
// confirmed, both hellowork-url.ts and this file update together.
describe("buildHelloworkSearchUrl", () => {
  it("sets the keyword param", () => {
    const url = parse(
      buildHelloworkSearchUrl({
        keywords: "développeur react",
        lookback: LOOKBACK,
        page: 0,
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://www.hellowork.com/fr-fr/emploi/recherche.html",
    );
    expect(url.searchParams.get("k")).toBe("développeur react");
  });

  it("includes the location only when provided", () => {
    expect(
      parse(
        buildHelloworkSearchUrl({
          keywords: "dev",
          lookback: LOOKBACK,
          page: 0,
        }),
      ).searchParams.has("l"),
    ).toBe(false);

    expect(
      parse(
        buildHelloworkSearchUrl({
          keywords: "dev",
          location: "Paris",
          lookback: LOOKBACK,
          page: 0,
        }),
      ).searchParams.get("l"),
    ).toBe("Paris");
  });

  it("omits page for page 0 and emits it 1-indexed from page 1 on", () => {
    expect(
      parse(
        buildHelloworkSearchUrl({
          keywords: "dev",
          lookback: LOOKBACK,
          page: 0,
        }),
      ).searchParams.has("p"),
    ).toBe(false);

    expect(
      parse(
        buildHelloworkSearchUrl({
          keywords: "dev",
          lookback: LOOKBACK,
          page: 3,
        }),
      ).searchParams.get("p"),
    ).toBe("4");
  });

  it("ignores the lookback window (no HelloWork query param wired for it)", () => {
    const a = buildHelloworkSearchUrl({
      keywords: "dev",
      lookback: { type: "24h" },
      page: 0,
    });
    const b = buildHelloworkSearchUrl({
      keywords: "dev",
      lookback: { type: "since_date", since: new Date("2026-01-01") },
      page: 0,
    });
    expect(a).toBe(b);
  });
});
