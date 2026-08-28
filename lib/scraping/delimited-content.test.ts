import { describe, it, expect } from "vitest";
import { buildDelimitedContent } from "./delimited-content";

describe("buildDelimitedContent", () => {
  it("wraps each listing in the id-tagged delimiters the extraction prompt parses", () => {
    const out = buildDelimitedContent([
      { listingId: "l0_0", rawText: "Développeur Frontend\nDoctolib" },
    ]);

    expect(out).toBe(
      '<<<LISTING id="l0_0">>>\nDéveloppeur Frontend\nDoctolib\n<<<END_LISTING>>>',
    );
  });

  it("separates multiple blocks with a blank line", () => {
    const out = buildDelimitedContent([
      { listingId: "l0_0", rawText: "A" },
      { listingId: "l0_1", rawText: "B" },
    ]);

    expect(out).toBe(
      '<<<LISTING id="l0_0">>>\nA\n<<<END_LISTING>>>\n\n<<<LISTING id="l0_1">>>\nB\n<<<END_LISTING>>>',
    );
  });

  it("returns an empty string for no listings", () => {
    expect(buildDelimitedContent([])).toBe("");
  });
});
