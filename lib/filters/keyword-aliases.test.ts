import { describe, it, expect } from "vitest";
import { KEYWORD_ALIASES } from "./keyword-aliases";

function applyAliases(text: string): string {
  return KEYWORD_ALIASES.reduce(
    (acc, { pattern, canonical }) => acc.replace(pattern, canonical),
    text,
  );
}

describe("KEYWORD_ALIASES", () => {
  it("folds full-stack spelling variants to fullstack", () => {
    expect(applyAliases("Full-Stack Developer")).toBe("fullstack Developer");
    expect(applyAliases("Full Stack Developer")).toBe("fullstack Developer");
    expect(applyAliases("Fullstack Developer")).toBe("fullstack Developer");
  });

  it("folds front-end and back-end spelling variants", () => {
    expect(applyAliases("Front-End Engineer")).toBe("frontend Engineer");
    expect(applyAliases("Back End Engineer")).toBe("backend Engineer");
  });

  it("folds low-code spelling variants", () => {
    expect(applyAliases("Low-Code Platform")).toBe("lowcode Platform");
  });

  it("fuses tech lead into lead", () => {
    expect(applyAliases("Tech Lead Developer")).toBe("lead Developer");
    expect(applyAliases("Tech-Lead Developer")).toBe("lead Developer");
  });

  it("applies multiple aliases within the same string independently", () => {
    // "Backend" itself matches back[\s-]?end (the separator is optional),
    // so both the tech-lead and back-end patterns fire on this input.
    expect(applyAliases("Tech Lead Backend")).toBe("lead backend");
  });

  it("strips the .js suffix from known framework names, dot optional", () => {
    expect(applyAliases("Vue.js Developer")).toBe("Vue Developer");
    expect(applyAliases("VueJS Developer")).toBe("Vue Developer");
    expect(applyAliases("Node.js Developer")).toBe("Node Developer");
  });

  it("does not affect text with no matching variant", () => {
    expect(applyAliases("Développeur PHP")).toBe("Développeur PHP");
  });

  it("is declared with jsFrameworkSuffixPattern available (no ReferenceError at eval)", () => {
    expect(() => KEYWORD_ALIASES).not.toThrow();
    expect(KEYWORD_ALIASES.length).toBeGreaterThan(0);
  });
});
