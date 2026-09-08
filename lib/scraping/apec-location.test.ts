import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveApecLocation,
  __clearApecLocationCache,
  APEC_LOCATION_ENDPOINT,
} from "./apec-location";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Real captured shapes (2026-09-08).
const PARIS_DEPARTEMENT = {
  lieuDisplay: "Paris - 75",
  lieuId: 75,
  lieuType: "FR_DEPARTEMENT",
  citycode: "75",
  lieuxParentsIds: ["711"],
};
const PARIS_COMMUNE = {
  lieuDisplay: "Paris 01 - 75",
  lieuId: 590711,
  lieuType: "FR_COMMUNE",
  latitude: 48.8625854,
  longitude: 2.336428,
  citycode: "75101",
  lieuxParentsIds: ["75", "711"],
};
const LYON_COMMUNE = {
  lieuDisplay: "Lyon - 69",
  lieuId: 596717,
  lieuType: "FR_COMMUNE",
  citycode: "69123",
  lieuxParentsIds: ["69", "20049"],
};

beforeEach(() => {
  __clearApecLocationCache();
});

describe("resolveApecLocation", () => {
  it("takes the first suggestion's lieuId (department-level, no lat/lng)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([PARIS_DEPARTEMENT, PARIS_COMMUNE]),
    );

    const result = await resolveApecLocation(
      "Paris",
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({ code: "75" });
  });

  it("stringifies a numeric lieuId and accepts a commune-level first hit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([LYON_COMMUNE]));

    const result = await resolveApecLocation(
      "Lyon",
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({ code: "596717" });
  });

  it("does not false-trip on an unseen lieuType or missing lat/lng", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        {
          lieuDisplay: "Île-de-France",
          lieuId: 711,
          lieuType: "FR_REGION",
          citycode: "11",
          lieuxParentsIds: [],
        },
      ]),
    );

    const result = await resolveApecLocation(
      "Ile de France",
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({ code: "711" });
  });

  it("sends q plus the four lieuTypeRecherche values", async () => {
    const fetchImpl = vi.fn((...args: unknown[]) => {
      void args;
      return Promise.resolve(jsonResponse([PARIS_DEPARTEMENT]));
    });

    await resolveApecLocation("Paris", fetchImpl as unknown as typeof fetch);

    const calledUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(calledUrl.origin + calledUrl.pathname).toBe(APEC_LOCATION_ENDPOINT);
    expect(calledUrl.searchParams.get("q")).toBe("Paris");
    expect(calledUrl.searchParams.get("max")).toBe("100");
    expect(calledUrl.searchParams.getAll("lieuTypeRecherche")).toEqual([
      "FR_COMMUNE",
      "FR_COMMUNE_A_ARRONDISSEMENT",
      "FR_DEPARTEMENT",
      "FR_REGION",
    ]);
  });

  it("returns no_match on an empty suggestion list", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));

    const result = await resolveApecLocation(
      "Nowherecity",
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({ code: null, reason: "no_match" });
  });

  it("returns no_match on a transport error or non-2xx (soft failure)", async () => {
    const boom = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(
      await resolveApecLocation("Paris", boom as unknown as typeof fetch),
    ).toEqual({ code: null, reason: "no_match" });

    __clearApecLocationCache();

    const notFound = vi.fn(async () => jsonResponse([], 503));
    expect(
      await resolveApecLocation("Paris", notFound as unknown as typeof fetch),
    ).toEqual({ code: null, reason: "no_match" });
  });

  it("caches by normalized input — a second call does not re-fetch", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([PARIS_DEPARTEMENT]));

    await resolveApecLocation("Paris", fetchImpl as unknown as typeof fetch);
    await resolveApecLocation("  paris ", fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
