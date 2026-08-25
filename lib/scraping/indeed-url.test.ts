import { describe, it, expect } from "vitest";
import { buildIndeedSearchUrl } from "./indeed-url";

describe("buildIndeedSearchUrl", () => {
  it("sets q and l from keywords and location", () => {
    const url = new URL(
      buildIndeedSearchUrl({
        keywords: "développeur",
        location: "Paris",
        lookback: { type: "24h" },
        page: 0,
      }),
    );
    expect(url.searchParams.get("q")).toBe("développeur");
    expect(url.searchParams.get("l")).toBe("Paris");
  });

  it("omits l when location is not provided", () => {
    const url = new URL(
      buildIndeedSearchUrl({
        keywords: "développeur",
        lookback: { type: "24h" },
        page: 0,
      }),
    );
    expect(url.searchParams.has("l")).toBe(false);
  });

  it("sets fromage=1 for a 24h lookback window", () => {
    const url = new URL(
      buildIndeedSearchUrl({
        keywords: "x",
        lookback: { type: "24h" },
        page: 0,
      }),
    );
    expect(url.searchParams.get("fromage")).toBe("1");
  });

  it("sets fromage=3 for a 3-day lookback window", () => {
    const url = new URL(
      buildIndeedSearchUrl({
        keywords: "x",
        lookback: { type: "3d" },
        page: 0,
      }),
    );
    expect(url.searchParams.get("fromage")).toBe("3");
  });

  it("omits fromage for a since_date lookback window", () => {
    const url = new URL(
      buildIndeedSearchUrl({
        keywords: "x",
        lookback: { type: "since_date", since: new Date("2026-01-01") },
        page: 0,
      }),
    );
    expect(url.searchParams.has("fromage")).toBe(false);
  });

  it("omits start on the first page", () => {
    const url = new URL(
      buildIndeedSearchUrl({
        keywords: "x",
        lookback: { type: "24h" },
        page: 0,
      }),
    );
    expect(url.searchParams.has("start")).toBe(false);
  });

  it("sets start to page * 10 on subsequent pages", () => {
    const url = new URL(
      buildIndeedSearchUrl({
        keywords: "x",
        lookback: { type: "24h" },
        page: 2,
      }),
    );
    expect(url.searchParams.get("start")).toBe("20");
  });
});
