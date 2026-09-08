import { describe, it, expect, vi } from "vitest";
import {
  buildApecSearchBody,
  buildApecOfferUrl,
  fetchApecResultsPage,
  APEC_PAGE_SIZE,
  OWN_OFFERS_TYPES_CONVENTION,
} from "./apec-api";
import { ScrapeBlockedError, ScrapeMarkupError } from "./errors";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const RESULT = {
  numeroOffre: "174123456W",
  intitule: "Développeur Frontend Senior React",
  nomCommercial: "Doctolib",
  salaireTexte: "45 000 - 55 000 € brut / an",
  datePublication: "2026-09-06",
  lieuTexte: "Paris (75)",
};

describe("buildApecSearchBody", () => {
  it("pins the four partner-site-excluded typesConvention values (SPEC §2)", () => {
    const body = buildApecSearchBody({ searchTerm: "dev", page: 0 });
    expect(body.typesConvention).toEqual([...OWN_OFFERS_TYPES_CONVENTION]);
    expect(body.typesConvention).not.toContain("143706");
  });

  it("sorts by date descending", () => {
    const body = buildApecSearchBody({ searchTerm: "dev", page: 0 });
    expect(body.sorts).toEqual([{ type: "DATE", direction: "DESCENDING" }]);
  });

  it("translates the 0-indexed page to a startIndex offset", () => {
    expect(
      buildApecSearchBody({ searchTerm: "dev", page: 0 }).pagination,
    ).toEqual({ startIndex: 0, range: APEC_PAGE_SIZE });
    expect(
      buildApecSearchBody({ searchTerm: "dev", page: 3 }).pagination,
    ).toEqual({ startIndex: 3 * APEC_PAGE_SIZE, range: APEC_PAGE_SIZE });
  });

  it("includes lieux only when non-empty", () => {
    expect(
      buildApecSearchBody({ searchTerm: "dev", page: 0 }),
    ).not.toHaveProperty("lieux");
    expect(
      buildApecSearchBody({ searchTerm: "dev", page: 0, lieux: [] }),
    ).not.toHaveProperty("lieux");
    expect(
      buildApecSearchBody({ searchTerm: "dev", page: 0, lieux: ["590711"] })
        .lieux,
    ).toEqual(["590711"]);
  });
});

describe("buildApecOfferUrl", () => {
  it("appends the offer id to the detail-page base", () => {
    expect(buildApecOfferUrl("174123456W")).toBe(
      "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/174123456W",
    );
  });
});

describe("fetchApecResultsPage", () => {
  it("maps a well-formed response to listings + totalCount", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ totalCount: 128, resultats: [RESULT] }),
    );

    const { listings, totalCount } = await fetchApecResultsPage(
      { searchTerm: "développeur", lieux: ["590711"], page: 0 },
      fetchImpl as unknown as typeof fetch,
    );

    expect(totalCount).toBe(128);
    expect(listings).toEqual([
      {
        title: "Développeur Frontend Senior React",
        company: "Doctolib",
        salaryRaw: "45 000 - 55 000 € brut / an",
        datePosted: "2026-09-06",
        url: "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/174123456W",
      },
    ]);
  });

  it("nulls an absent/blank company (anonymous employer)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        totalCount: 1,
        resultats: [{ ...RESULT, nomCommercial: "  " }],
      }),
    );

    const { listings } = await fetchApecResultsPage(
      { searchTerm: "dev", page: 0 },
      fetchImpl as unknown as typeof fetch,
    );

    expect(listings[0].company).toBeNull();
  });

  it("tolerates unknown extra fields (passthrough, not a strict allowlist)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        totalCount: 1,
        resultats: [{ ...RESULT, someNewApecField: 42 }],
        someNewTopLevelField: true,
      }),
    );

    await expect(
      fetchApecResultsPage(
        { searchTerm: "dev", page: 0 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBeDefined();
  });

  it("throws ScrapeMarkupError when the response shape drifts", async () => {
    const fetchImpl = vi.fn(async () =>
      // `resultats` renamed / missing — the drift tripwire
      jsonResponse({ totalCount: 10, offers: [RESULT] }),
    );

    await expect(
      fetchApecResultsPage(
        { searchTerm: "dev", page: 0 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ScrapeMarkupError);
  });

  it("throws ScrapeMarkupError on a non-JSON body", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("<!doctype html><html>...</html>", { status: 200 }),
    );

    await expect(
      fetchApecResultsPage(
        { searchTerm: "dev", page: 0 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ScrapeMarkupError);
  });

  it("throws ScrapeMarkupError on a generic non-2xx", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "oops" }, 500));

    await expect(
      fetchApecResultsPage(
        { searchTerm: "dev", page: 0 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ScrapeMarkupError);
  });

  it("throws ScrapeBlockedError on a 403", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "denied" }, 403));

    await expect(
      fetchApecResultsPage(
        { searchTerm: "dev", page: 0 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ScrapeBlockedError);
  });

  it("throws ScrapeBlockedError on a bot-challenge body", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("Just a moment... please verify you are human", {
          status: 200,
        }),
    );

    await expect(
      fetchApecResultsPage(
        { searchTerm: "dev", page: 0 },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ScrapeBlockedError);
  });
});
