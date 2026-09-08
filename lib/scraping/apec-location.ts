import { z } from "zod";
import { SCRAPER_USER_AGENT } from "./politeness";

/**
 * Resolves a free-text location string (the raw `JobConfig.location` /
 * ad-hoc `location` value) to an Apec `lieuId` for the `rechercheOffre`
 * `lieux` field.
 *
 * Deterministic lookup, no LLM (CLAUDE.md decision #1 — "Playwright, not
 * agents" bars a *model* driving navigation, not a plain data fetch). A
 * `lieuId` for a real place is effectively static, so results are cached for
 * the worker's lifetime.
 *
 * ── Matching heuristic ───────────────────────────────────────────────
 * Apec's location field is an autocomplete; this resolver fires the same
 * request the field does ({@link APEC_LOCATION_ENDPOINT} with the same
 * `lieuTypeRecherche` set) and **takes the first suggestion**, using its
 * `lieuId`.
 *
 * This is validated (live 2026-09-08) only for **complete, correctly-spelled
 * location strings** — the kind `JobConfig.location` is expected to hold:
 * "Paris" → `lieuId 75` (`FR_DEPARTEMENT`), "Lyon" → `lieuId 596717`
 * (`FR_COMMUNE`), each the canonical first entry.
 *
 * It is known NOT to hold for a partial / incomplete query: the mid-keystroke
 * string "pari" returned "Parignargues - 30" (a Gard commune) as its first
 * result, nothing Paris-related. So a maintainer reusing this resolver for a
 * live-typed or otherwise incomplete input — rather than a stored complete
 * string — must add disambiguation first (e.g. an exact `lieuDisplay` /
 * accent-folded match, or a `lieuType` preference, before falling back to
 * first).
 *
 * Endpoint + response shape verified live 2026-09-08 against three captured
 * responses ("Paris" department- and commune-level entries, "Lyon"). Pinned
 * like the DOM selectors it replaces — re-verify if
 * {@link ApecLocationResponseSchema} starts rejecting responses.
 */
export const APEC_LOCATION_ENDPOINT =
  "https://www.apec.fr/cms/webservices/autocompletion/lieuautocomplete";

/**
 * Static query params sent with every autocomplete request, alongside the
 * `q={freeText}` term. The four `lieuTypeRecherche` values are repeated (one
 * param each) — matching Apec's own UI request — so a department, an
 * arrondissement-bearing commune, or a region is an acceptable match, not
 * just a plain commune.
 */
const LOCATION_QUERY_PARAMS: [string, string][] = [
  ["max", "100"],
  ["byLeftAndRight", "false"],
  ["byLieuType", "true"],
  ["lieuTypeRecherche", "FR_COMMUNE"],
  ["lieuTypeRecherche", "FR_COMMUNE_A_ARRONDISSEMENT"],
  ["lieuTypeRecherche", "FR_DEPARTEMENT"],
  ["lieuTypeRecherche", "FR_REGION"],
];

export type ApecLocationResolution =
  { code: string } | { code: null; reason: "no_match" };

/**
 * One autocomplete suggestion.
 *
 * - `latitude` / `longitude` are optional and their absence does NOT track
 *   `lieuType` — captured live absent on both a `FR_DEPARTEMENT` entry and a
 *   `FR_COMMUNE` entry ("Lyon"), present on another `FR_COMMUNE` entry
 *   ("Paris 01"). So they are plain `.optional()`, never gated on the type.
 * - `lieuType` is `z.string()`, not an enum: the request asks for four
 *   `lieuTypeRecherche` values but only `FR_COMMUNE` / `FR_DEPARTEMENT` have
 *   been seen in a response — a legitimate `FR_REGION` /
 *   `FR_COMMUNE_A_ARRONDISSEMENT` result must not false-trip the schema.
 * - `.passthrough()` keeps unknown fields — only `lieuId` is load-bearing.
 */
const ApecLocationSuggestionSchema = z
  .object({
    lieuId: z.union([z.string(), z.number()]).transform(String),
    lieuDisplay: z.string().nullish(),
    lieuType: z.string().nullish(),
    citycode: z.string().nullish(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .passthrough();

/** The response is a bare JSON array of suggestions (verified live). */
export const ApecLocationResponseSchema = z.array(ApecLocationSuggestionSchema);

// Process-lifetime, best-effort, non-authoritative. Keyed by the trimmed +
// lower-cased input. `no_match` is cached too — an input that doesn't
// resolve now won't start resolving mid-process.
const cache = new Map<string, ApecLocationResolution>();

/** Test seam: clears the module-scope cache. */
export function __clearApecLocationCache(): void {
  cache.clear();
}

/**
 * @param fetchImpl injectable for tests; defaults to global `fetch`.
 * @returns `{ code }` with the first suggestion's `lieuId`, or
 *   `{ code: null, reason: "no_match" }` when the autocomplete returns
 *   nothing usable (including on a transport / shape failure — a location we
 *   can't resolve is handled the same whether the cause is "no such place"
 *   or "service hiccup": the run skips Apec and says so).
 */
export async function resolveApecLocation(
  freeText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApecLocationResolution> {
  const key = freeText.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const resolution = await fetchAndResolve(freeText, fetchImpl);
  cache.set(key, resolution);
  return resolution;
}

async function fetchAndResolve(
  freeText: string,
  fetchImpl: typeof fetch,
): Promise<ApecLocationResolution> {
  const noMatch = { code: null, reason: "no_match" } as const;

  let json: unknown;
  try {
    const url = new URL(APEC_LOCATION_ENDPOINT);
    url.searchParams.set("q", freeText.trim());
    for (const [name, value] of LOCATION_QUERY_PARAMS) {
      url.searchParams.append(name, value);
    }

    const response = await fetchImpl(url.toString(), {
      headers: { "user-agent": SCRAPER_USER_AGENT, accept: "application/json" },
    });
    if (!response.ok) return noMatch;
    json = await response.json();
  } catch {
    return noMatch;
  }

  const parsed = ApecLocationResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.length === 0) return noMatch;

  return { code: parsed.data[0].lieuId };
}
