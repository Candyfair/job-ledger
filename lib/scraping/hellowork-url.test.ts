import { describe, it, expect } from "vitest";
import { buildHelloworkSearchUrl } from "./hellowork-url";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";

const LOOKBACK: LookbackWindow = { type: "3d" };

function parse(url: string) {
  return new URL(url);
}

// Query params verified 2026-08-28 via manual DevTools inspection — see the
// hellowork-url.ts header. (The DOM selectors in hellowork-scraper.ts are
// still unverified and untested.)
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
          location: "Paris 75001",
          lookback: LOOKBACK,
          page: 0,
        }),
      ).searchParams.get("l"),
    ).toBe("Paris 75001");
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

  it("pins the fixed search-filter params (st / ray / msa)", () => {
    const url = parse(
      buildHelloworkSearchUrl({ keywords: "dev", lookback: LOOKBACK, page: 0 }),
    );
    expect(url.searchParams.get("st")).toBe("relevance");
    expect(url.searchParams.get("ray")).toBe("20");
    // msa = minimum annual salary in €; pinned at 0 (no minimum) — no
    // JobConfig field maps to a salary floor.
    expect(url.searchParams.get("msa")).toBe("0");
  });

  describe("d — date/lookback filter", () => {
    function d(lookback: LookbackWindow) {
      return parse(
        buildHelloworkSearchUrl({ keywords: "dev", lookback, page: 0 }),
      ).searchParams.get("d");
    }

    it("maps a 24h lookback to d=h", () => {
      expect(d({ type: "24h" })).toBe("h");
    });

    it("maps a 3-day lookback to d=d — the param KEY 'd' and this VALUE 'd' are an unrelated naming collision, not a bug", () => {
      expect(d({ type: "3d" })).toBe("d");
    });

    it("maps a since_date lookback to d=all (no HelloWork bucket fits an arbitrary date; post-extraction filter handles it)", () => {
      expect(d({ type: "since_date", since: new Date("2026-01-01") })).toBe(
        "all",
      );
    });
  });
});
