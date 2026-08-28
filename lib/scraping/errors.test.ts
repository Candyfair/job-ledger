import { describe, it, expect } from "vitest";
import {
  ScrapeBlockedError,
  ScrapeMarkupError,
  isBotChallengePage,
  describeScrapeError,
} from "./errors";

describe("isBotChallengePage", () => {
  it("matches known challenge-page copy, case-insensitively", () => {
    expect(isBotChallengePage("Just a moment...")).toBe(true);
    expect(isBotChallengePage("Checking your browser before accessing")).toBe(
      true,
    );
    expect(isBotChallengePage("Additional Verification Required")).toBe(true);
    expect(isBotChallengePage("Cloudflare Ray ID: 8ab...")).toBe(true);
  });

  it("does not match normal search-results text", () => {
    expect(
      isBotChallengePage(
        "Développeur Frontend Senior React — Doctolib — Paris — Publié il y a 3 jours",
      ),
    ).toBe(false);
    expect(
      isBotChallengePage("Aucune offre ne correspond à votre recherche"),
    ).toBe(false);
  });
});

describe("describeScrapeError", () => {
  it("classifies a ScrapeBlockedError as bot_challenge with the block message", () => {
    const { cause, note } = describeScrapeError(
      new ScrapeBlockedError("challenge page"),
      "hellowork",
    );
    expect(cause).toBe("bot_challenge");
    expect(note).toContain("HelloWork");
    expect(note).toContain("anti-bot");
  });

  it("classifies a ScrapeMarkupError as markup_broken", () => {
    const { cause, note } = describeScrapeError(
      new ScrapeMarkupError("selector missing"),
      "apec",
    );
    expect(cause).toBe("markup_broken");
    expect(note).toContain("Apec.fr");
    expect(note).toContain("changé");
  });

  it("treats a bare Playwright-style timeout as markup_broken", () => {
    const timeout = new Error("Timeout 15000ms exceeded waiting for locator");
    const { cause } = describeScrapeError(timeout, "hellowork");
    expect(cause).toBe("markup_broken");
  });

  it("treats a non-Error throw as markup_broken", () => {
    const { cause, note } = describeScrapeError("boom", "hellowork");
    expect(cause).toBe("markup_broken");
    expect(note).toContain("HelloWork");
  });
});
