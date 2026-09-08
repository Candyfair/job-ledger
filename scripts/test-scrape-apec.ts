// Standalone harness for iterating on the Apec.fr direct-API scraping
// pipeline without the Trigger.dev dev cycle. No DB writes — prints the
// final normalized + lookback-filtered listings as JSON.
//
// This is also the live blocking-behavior probe: it fires several real
// cookieless POSTs to Apec's search web-service a few seconds apart. Watch
// for a non-200, a 429, or a challenge body — those surface as
// ScrapeBlockedError / ScrapeMarkupError here.
//
// Usage: npm run test:scrape:apec  (Node 22 — `nvm use 22` first)

import { ClaudeHaikuAdapter } from "@/lib/extraction/claude-haiku";
import { isWithinLookbackWindow } from "@/lib/extraction/lookback-window";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";
import { normalizeCompany } from "@/lib/dedup/normalize-company";
import { fetchApecResultsPage, APEC_PAGE_SIZE } from "@/lib/scraping/apec-api";
import { resolveApecLocation } from "@/lib/scraping/apec-location";
import { sleep, randomDelayMs } from "@/lib/scraping/politeness";
import { ScrapeBlockedError, ScrapeMarkupError } from "@/lib/scraping/errors";

// Hardcoded search params for local iteration — no JobConfig, no trigger form.
const SEARCH = {
  searchTerm: "développeur",
  location: "Paris" as string | null,
  lookback: { type: "3d" } as LookbackWindow,
};

const VOLUME_CAP = 50; // SPEC.md §7
const MAX_PAGES = 5;

async function main() {
  let lieux: string[] | undefined;
  if (SEARCH.location) {
    const located = await resolveApecLocation(SEARCH.location);
    if (located.code === null) {
      console.error(
        `Location "${SEARCH.location}" did not resolve to an Apec lieuId — would skip Apec for this run.`,
      );
      return;
    }
    lieux = [located.code];
    console.error(`Resolved "${SEARCH.location}" → lieuId ${located.code}`);
  }

  const adapter = new ClaudeHaikuAdapter();
  const collected: {
    title: string;
    company: string | null;
    companyNormalized: string | null;
    roleCanonical: string | null;
    datePosted: string | null;
    salaryRaw: string | null;
    url: string;
  }[] = [];

  try {
    let pageNum = 0;
    let fetched = 0;
    let totalCount = Infinity;

    while (
      collected.length < VOLUME_CAP &&
      fetched < totalCount &&
      pageNum < MAX_PAGES
    ) {
      if (pageNum > 0) await sleep(randomDelayMs());

      console.error(`Fetching page ${pageNum}...`);
      const page = await fetchApecResultsPage({
        searchTerm: SEARCH.searchTerm,
        lieux,
        page: pageNum,
      });
      totalCount = page.totalCount;
      fetched += page.listings.length;
      console.error(
        `  ${page.listings.length} listings, totalCount=${totalCount}`,
      );

      if (page.listings.length === 0) break;

      for (const l of page.listings) {
        if (!isWithinLookbackWindow(l.datePosted, SEARCH.lookback)) continue;
        collected.push({
          title: l.title,
          company: l.company,
          companyNormalized: l.company ? normalizeCompany(l.company) : null,
          roleCanonical: null,
          datePosted: l.datePosted,
          salaryRaw: l.salaryRaw,
          url: l.url,
        });
        if (collected.length >= VOLUME_CAP) break;
      }
      pageNum += 1;
    }

    if (collected.length > 0) {
      const roles = await adapter.canonicalizeRoles(
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

  console.log(JSON.stringify(collected, null, 2));
  console.error(
    `\nDone. ${collected.length} listing(s) within the lookback window ` +
      `(page size ${APEC_PAGE_SIZE}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
