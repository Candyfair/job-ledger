// Standalone harness for iterating on the Apec.fr direct-API scraping
// pipeline without the Trigger.dev dev cycle. No DB writes — prints the
// final normalized + lookback-filtered listings as JSON.
//
// This is also the live blocking-behavior probe: it fires several real
// cookieless POSTs to Apec's search web-service a few seconds apart. Watch
// for a non-200, a 429, or a challenge body — those surface as
// ScrapeBlockedError / ScrapeMarkupError here.
//
// Usage: npm run test:scrape:apec [-- <flags>]  (Node 22 — `nvm use 22` first)
//
// Flags (all optional; defaults reproduce the historical hardcoded run):
//   --term <string>          search term            (default: développeur)
//   --location <string>      free-text location     (default: Paris)
//   --no-location            nationwide search (overrides --location)
//   --since <YYYY-MM-DD>     lookback: since_date at local midnight
//   --lookback <24h|3d>      lookback preset, used when --since is absent
//                                                   (default: 3d)
//   --max-listings <n>       harness-local volume cap (default: 50)
//   --max-pages <n>          harness-local page-fetch guard (default: 5)
//   --skip-roles             skip the canonicalizeRoles LLM call
//
// --max-listings / --max-pages only move the harness's own loop bounds —
// production's VOLUME_CAP (SPEC.md §7) and MAX_APEC_PAGES are untouched.
// They exist so this probe can drive the multi-page path, which a real run
// (page size == VOLUME_CAP == 50, date-descending sort) otherwise only
// reaches in a narrow band of totalCount / lookback combinations.

import { isWithinLookbackWindow } from "@/lib/extraction/lookback-window";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";
import { normalizeCompany } from "@/lib/dedup/normalize-company";
import { fetchApecResultsPage, APEC_PAGE_SIZE } from "@/lib/scraping/apec-api";
import { resolveApecLocation } from "@/lib/scraping/apec-location";
import { sleep, randomDelayMs } from "@/lib/scraping/politeness";
import { ScrapeBlockedError, ScrapeMarkupError } from "@/lib/scraping/errors";

interface CliOptions {
  searchTerm: string;
  location: string | null;
  lookback: LookbackWindow;
  maxListings: number;
  maxPages: number;
  skipRoles: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    searchTerm: "développeur",
    location: "Paris",
    lookback: { type: "3d" },
    maxListings: 50,
    maxPages: 5,
    skipRoles: false,
  };

  let since: string | undefined;
  let lookbackPreset: "24h" | "3d" | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    switch (arg) {
      case "--term":
        opts.searchTerm = next();
        break;
      case "--location":
        opts.location = next();
        break;
      case "--no-location":
        opts.location = null;
        break;
      case "--since":
        since = next();
        break;
      case "--lookback": {
        const value = next();
        if (value !== "24h" && value !== "3d") {
          throw new Error(`--lookback must be 24h or 3d, got "${value}"`);
        }
        lookbackPreset = value;
        break;
      }
      case "--max-listings":
        opts.maxListings = Number.parseInt(next(), 10);
        break;
      case "--max-pages":
        opts.maxPages = Number.parseInt(next(), 10);
        break;
      case "--skip-roles":
        opts.skipRoles = true;
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }

  if (since !== undefined) {
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`--since is not a valid date: "${since}"`);
    }
    opts.lookback = { type: "since_date", since: parsed };
  } else if (lookbackPreset !== undefined) {
    opts.lookback = { type: lookbackPreset };
  }

  if (!Number.isInteger(opts.maxListings) || opts.maxListings < 1) {
    throw new Error("--max-listings must be a positive integer");
  }
  if (!Number.isInteger(opts.maxPages) || opts.maxPages < 1) {
    throw new Error("--max-pages must be a positive integer");
  }

  return opts;
}

function describeLookback(lookback: LookbackWindow): string {
  return lookback.type === "since_date"
    ? `since_date ${lookback.since.toISOString()}`
    : lookback.type;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.error(
    `Params: term="${opts.searchTerm}" location=${
      opts.location === null ? "(nationwide)" : `"${opts.location}"`
    } lookback=${describeLookback(opts.lookback)} maxListings=${
      opts.maxListings
    } maxPages=${opts.maxPages} skipRoles=${opts.skipRoles}`,
  );

  let lieux: string[] | undefined;
  if (opts.location) {
    const located = await resolveApecLocation(opts.location);
    if (located.code === null) {
      console.error(
        `Location "${opts.location}" did not resolve to an Apec lieuId — would skip Apec for this run.`,
      );
      return;
    }
    lieux = [located.code];
    console.error(`Resolved "${opts.location}" → lieuId ${located.code}`);
  }

  const collected: {
    title: string;
    company: string | null;
    companyNormalized: string | null;
    roleCanonical: string | null;
    datePosted: string | null;
    salaryRaw: string | null;
    url: string;
  }[] = [];

  // Every listing URL returned by the API across every page fetched, in
  // fetch order — verification-only, for the cross-page duplicate check
  // (an off-by-one in `startIndex` would re-fetch a page and show here).
  const allFetchedUrls: string[] = [];
  const pageSizes: number[] = [];
  let pagesFetched = 0;
  let firstTotalCount: number | null = null;
  let terminationReason = "loop condition";

  try {
    let pageNum = 0;
    let fetched = 0;
    let totalCount = Infinity;

    while (
      collected.length < opts.maxListings &&
      fetched < totalCount &&
      pageNum < opts.maxPages
    ) {
      if (pageNum > 0) await sleep(randomDelayMs());

      const startIndex = pageNum * APEC_PAGE_SIZE;
      const page = await fetchApecResultsPage({
        searchTerm: opts.searchTerm,
        lieux,
        page: pageNum,
      });
      pagesFetched += 1;
      totalCount = page.totalCount;
      if (firstTotalCount === null) firstTotalCount = totalCount;
      fetched += page.listings.length;
      pageSizes.push(page.listings.length);
      for (const l of page.listings) allFetchedUrls.push(l.url);

      if (page.listings.length === 0) {
        console.error(
          `page ${pageNum}: startIndex=${startIndex} resultats.length=0 totalCount=${totalCount} — stopping`,
        );
        terminationReason = "empty page";
        break;
      }

      for (const l of page.listings) {
        if (!isWithinLookbackWindow(l.datePosted, opts.lookback)) continue;
        collected.push({
          title: l.title,
          company: l.company,
          companyNormalized: l.company ? normalizeCompany(l.company) : null,
          roleCanonical: null,
          datePosted: l.datePosted,
          salaryRaw: l.salaryRaw,
          url: l.url,
        });
        if (collected.length >= opts.maxListings) break;
      }

      console.error(
        `page ${pageNum}: startIndex=${startIndex} resultats.length=${page.listings.length} ` +
          `totalCount=${totalCount} fetched=${fetched} collected=${collected.length}/${opts.maxListings}`,
      );

      pageNum += 1;
    }

    if (terminationReason === "loop condition") {
      if (collected.length >= opts.maxListings) {
        terminationReason = "volume cap reached";
      } else if (fetched >= totalCount) {
        terminationReason = "totalCount exhausted";
      } else if (pageNum >= opts.maxPages) {
        terminationReason = "max-pages guard hit";
      }
    }

    if (!opts.skipRoles && collected.length > 0) {
      const { ClaudeHaikuAdapter } =
        await import("@/lib/extraction/claude-haiku");
      const roles = await new ClaudeHaikuAdapter().canonicalizeRoles(
        collected.map((c) => c.title),
      );
      collected.forEach((c, i) => {
        c.roleCanonical = roles[i] ?? null;
      });
    }
  } catch (error) {
    if (
      error instanceof ScrapeBlockedError ||
      error instanceof ScrapeMarkupError
    ) {
      console.error(`BLOCKED/DRIFT: [${error.name}] ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  // Cross-page duplicate-URL check (verification-only).
  const uniqueFetched = new Set(allFetchedUrls);
  const duplicates = new Map<string, number>();
  for (const url of allFetchedUrls) {
    duplicates.set(url, (duplicates.get(url) ?? 0) + 1);
  }
  const repeated = [...duplicates.entries()].filter(([, n]) => n > 1);

  console.log(JSON.stringify(collected, null, 2));

  const cap = opts.maxListings;
  const expectedFinal =
    firstTotalCount === null ? null : Math.min(firstTotalCount, cap);

  console.error(
    [
      "",
      "── Verification summary ─────────────────────────────",
      `search term:            "${opts.searchTerm}"`,
      `location:               ${opts.location === null ? "(nationwide)" : `"${opts.location}"`}`,
      `lookback:               ${describeLookback(opts.lookback)}`,
      `page size (constant):   ${APEC_PAGE_SIZE} (requested \`range\`)`,
      `page sizes (observed):  [${pageSizes.join(", ")}]`,
      `totalCount (page 0):    ${firstTotalCount ?? "n/a"}`,
      `pages fetched:          ${pagesFetched}`,
      `rows fetched (raw):     ${allFetchedUrls.length}`,
      `unique fetched URLs:    ${uniqueFetched.size}`,
      `duplicate URLs:         ${repeated.length === 0 ? "none" : repeated.map(([u, n]) => `${u} ×${n}`).join(", ")}`,
      `listings within window: ${collected.length}`,
      `expected min(totalCount, ${cap}): ${expectedFinal ?? "n/a"}`,
      `termination:            ${terminationReason}`,
      "─────────────────────────────────────────────────────",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
