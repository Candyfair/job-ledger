import { describe, it, expect } from "vitest";
import { normalize, normalizeVariants } from "./normalize";

describe("normalizeVariants", () => {
  it("folds alias patterns without touching accents or case", () => {
    expect(normalizeVariants("Full-Stack Développeur")).toBe(
      "fullstack Développeur",
    );
  });

  it("leaves text with no matching alias untouched", () => {
    expect(normalizeVariants("Développeur PHP")).toBe("Développeur PHP");
  });
});

describe("normalize", () => {
  it("folds variants, strips accents, and lowercases, in that order", () => {
    expect(normalize("Développeur PHP")).toBe("developpeur php");
    expect(normalize("Full-Stack Développeur")).toBe("fullstack developpeur");
  });

  // Locks in the composed output on the exact titles from SPEC.md §8's
  // exclusion-filtering scenarios (plus the C++ case from the same test
  // list) — tokenize.ts consumes normalize()'s output directly, so this
  // needs to be pinned before that module is built on top of it.
  it("produces the expected composed output for SPEC.md §8 example titles", () => {
    expect(normalize("Développeur PHP")).toBe("developpeur php");
    expect(normalize("Full-Stack Developer")).toBe("fullstack developer");
    expect(normalize("Développeur C++")).toBe("developpeur c++");
    expect(normalize("Chef de Projet Digital")).toBe("chef de projet digital");
    expect(normalize("Développeur .NET")).toBe("developpeur .net");
    expect(normalize("Senior Backend Engineer")).toBe(
      "senior backend engineer",
    );
  });

  it("is idempotent on already-normalized text", () => {
    const once = normalize("Chef de Projet Digital");
    expect(normalize(once)).toBe(once);
  });

  it("strips accents from various diacritics", () => {
    expect(normalize("é è ê à ù ç ô")).toBe("e e e a u c o");
  });

  it("is case-insensitive", () => {
    expect(normalize("SENIOR Backend Engineer")).toBe(
      normalize("senior backend engineer"),
    );
  });

  it("folds spelling variants before lowercasing/accent-stripping, matching SPEC.md §8 phrases", () => {
    expect(normalize("Fullstack Developer")).toBe(
      normalize("Full Stack Developer"),
    );
    expect(normalize("Vue.js Developer")).toBe(normalize("VueJS Developer"));
    expect(normalize("Tech Lead Backend")).toBe(normalize("lead backend"));
  });
});
