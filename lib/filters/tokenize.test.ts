import { describe, it, expect } from "vitest";
import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("senior backend engineer")).toEqual([
      "senior",
      "backend",
      "engineer",
    ]);
  });

  it("keeps a hyphen internal to a token", () => {
    expect(tokenize("full-stack developer")).toEqual([
      "full-stack",
      "developer",
    ]);
  });

  it("keeps a slash internal to a token", () => {
    expect(tokenize("react/node developer")).toEqual([
      "react/node",
      "developer",
    ]);
  });

  it("keeps a plus internal to a token (C++ stays one token)", () => {
    expect(tokenize("developpeur c++")).toEqual(["developpeur", "c++"]);
  });

  it("keeps a dot internal to a token (Node.js stays one token)", () => {
    expect(tokenize("node.js developer")).toEqual(["node.js", "developer"]);
  });

  it("keeps an underscore internal to a token", () => {
    expect(tokenize("chef_de_projet digital")).toEqual([
      "chef_de_projet",
      "digital",
    ]);
  });

  it("keeps a hash internal to a token", () => {
    expect(tokenize("developpeur c#")).toEqual(["developpeur", "c#"]);
  });

  it("treats ordinary punctuation as a separator", () => {
    expect(tokenize("developpeur, php (senior)")).toEqual([
      "developpeur",
      "php",
      "senior",
    ]);
  });

  it("splits a multi-word phrase into one token per word", () => {
    expect(tokenize("chef de projet digital")).toEqual([
      "chef",
      "de",
      "projet",
      "digital",
    ]);
  });

  it("returns an empty array for text with no token characters", () => {
    expect(tokenize("   , ( ) ")).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});
