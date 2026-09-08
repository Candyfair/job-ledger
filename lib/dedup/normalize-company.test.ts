import { describe, it, expect } from "vitest";
import { normalizeCompany } from "./normalize-company";

describe("normalizeCompany", () => {
  it("matches the extraction prompt's own examples", () => {
    expect(normalizeCompany("Doctolib SAS")).toBe("doctolib");
    expect(normalizeCompany("BLABLACAR SA")).toBe("blablacar");
    expect(normalizeCompany("Petite Boîte SARL")).toBe("petite boite");
  });

  it("strips every listed legal form as a trailing whole token", () => {
    expect(normalizeCompany("Alpha SASU")).toBe("alpha");
    expect(normalizeCompany("Beta EURL")).toBe("beta");
    expect(normalizeCompany("Gamma sarl")).toBe("gamma");
  });

  it("strips repeated trailing legal forms", () => {
    expect(normalizeCompany("Machin SARL SA")).toBe("machin");
  });

  it("does not strip a legal form that is part of a word", () => {
    expect(normalizeCompany("Sasha")).toBe("sasha");
    expect(normalizeCompany("Sabena")).toBe("sabena");
  });

  it("collapses internal whitespace and trims", () => {
    expect(normalizeCompany("  Big   Corp   ")).toBe("big corp");
  });

  it("returns an empty string when the name is only a legal form", () => {
    expect(normalizeCompany("SA")).toBe("");
    expect(normalizeCompany("  sarl ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeCompany("Doctolib SAS");
    expect(normalizeCompany(once)).toBe(once);
  });
});
