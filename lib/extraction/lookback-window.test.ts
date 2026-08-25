import { describe, it, expect } from "vitest";
import { isWithinLookbackWindow } from "./lookback-window";

const NOW = new Date("2026-08-25T12:00:00Z");

describe("isWithinLookbackWindow", () => {
  it("excludes a date outside the 24h window", () => {
    expect(isWithinLookbackWindow("2026-08-20", { type: "24h" }, NOW)).toBe(
      false,
    );
  });

  it("includes a date inside the 24h window", () => {
    expect(isWithinLookbackWindow("2026-08-25", { type: "24h" }, NOW)).toBe(
      true,
    );
  });

  it("includes a date inside the 3d window but excludes one outside it", () => {
    expect(isWithinLookbackWindow("2026-08-23", { type: "3d" }, NOW)).toBe(
      true,
    );
    expect(isWithinLookbackWindow("2026-08-19", { type: "3d" }, NOW)).toBe(
      false,
    );
  });

  it("excludes an entry with no usable date signal (null)", () => {
    expect(isWithinLookbackWindow(null, { type: "24h" }, NOW)).toBe(false);
  });

  it("excludes an entry with an unparseable date string", () => {
    expect(isWithinLookbackWindow("not a date", { type: "24h" }, NOW)).toBe(
      false,
    );
  });

  it("since_date compares against the given since date", () => {
    const since = new Date("2026-08-01");
    expect(
      isWithinLookbackWindow("2026-08-10", { type: "since_date", since }, NOW),
    ).toBe(true);
    expect(
      isWithinLookbackWindow("2026-07-01", { type: "since_date", since }, NOW),
    ).toBe(false);
  });
});
