import { describe, it, expect } from "vitest";
import { matchExclusionKeywords } from "./exclusion-matching";

describe("matchExclusionKeywords", () => {
  it("flags a whole-word match: PHP flags Développeur PHP", () => {
    expect(matchExclusionKeywords("Développeur PHP", ["PHP"])).toEqual(["PHP"]);
  });

  it("does not flag Stack against Full-Stack Developer (connector preserved)", () => {
    expect(matchExclusionKeywords("Full-Stack Developer", ["Stack"])).toEqual(
      [],
    );
  });

  it("flags C++ as its own token", () => {
    expect(matchExclusionKeywords("Développeur C++", ["C++"])).toEqual(["C++"]);
  });

  it("flags chef de projet as a contiguous phrase but not out of order or non-contiguous", () => {
    expect(
      matchExclusionKeywords("Chef de Projet Digital", ["chef de projet"]),
    ).toEqual(["chef de projet"]);
    expect(
      matchExclusionKeywords("Projet de Chef Digital", ["chef de projet"]),
    ).toEqual([]);
    expect(
      matchExclusionKeywords("Chef Digital de Projet", ["chef de projet"]),
    ).toEqual([]);
  });

  it("flags developpeur (no accent) against Développeur .NET", () => {
    expect(matchExclusionKeywords("Développeur .NET", ["developpeur"])).toEqual(
      ["developpeur"],
    );
  });

  it("flags senior against Senior Backend Engineer, case-insensitively", () => {
    expect(
      matchExclusionKeywords("Senior Backend Engineer", ["senior"]),
    ).toEqual(["senior"]);
  });

  it("flags full stack against Fullstack Developer and the reverse spelling variant", () => {
    expect(
      matchExclusionKeywords("Fullstack Developer", ["full stack"]),
    ).toEqual(["full stack"]);
    expect(
      matchExclusionKeywords("Full Stack Developer", ["fullstack"]),
    ).toEqual(["fullstack"]);
  });

  it("flags vue against a title containing Vue.js or VueJS", () => {
    expect(matchExclusionKeywords("Vue.js Developer", ["vue"])).toEqual([
      "vue",
    ]);
    expect(matchExclusionKeywords("VueJS Developer", ["vue"])).toEqual(["vue"]);
  });

  it("does not flag Senior against Seniors (no stemming)", () => {
    expect(matchExclusionKeywords("Backend Seniors", ["Senior"])).toEqual([]);
  });

  it("flags lead against Tech Lead (assumed fusion)", () => {
    expect(matchExclusionKeywords("Tech Lead Backend", ["lead"])).toEqual([
      "lead",
    ]);
  });

  it("returns an empty array when the keyword list is empty", () => {
    expect(matchExclusionKeywords("Développeur PHP", [])).toEqual([]);
  });

  it("skips a blank keyword without matching or throwing", () => {
    expect(matchExclusionKeywords("Développeur PHP", ["   "])).toEqual([]);
  });

  it("returns only the keywords that matched, preserving input order", () => {
    expect(
      matchExclusionKeywords("Senior Backend Engineer", [
        "senior",
        "frontend",
        "backend",
      ]),
    ).toEqual(["senior", "backend"]);
  });
});
