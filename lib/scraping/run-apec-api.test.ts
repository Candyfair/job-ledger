import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { scrapeRun, listing } from "@/drizzle/schema";
import { mockDrizzleChain } from "@/lib/test/mock-db";
import { markSiteFailed } from "./site-status";
import { ScrapeBlockedError, ScrapeMarkupError } from "./errors";
import { runApecApiScrape } from "./run-apec-api";
import { writeSiteOutcome, recomputeAndWriteRunStatus } from "@/lib/run-status";
import { resolveApecLocation } from "./apec-location";
import type { fetchApecResultsPage } from "./apec-api";
import type {
  ExtractionAdapter,
  RoleCanonicalizer,
} from "@/lib/extraction/adapter";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("./site-status", () => ({ markSiteFailed: vi.fn() }));
// The run-status rollup has its own dedicated tests (lib/run-status/*).
vi.mock("@/lib/run-status", () => ({
  writeSiteOutcome: vi.fn(),
  recomputeAndWriteRunStatus: vi.fn(async () => "completed"),
}));
vi.mock("./apec-location", () => ({ resolveApecLocation: vi.fn() }));
// No real inter-page delay in tests.
vi.mock("./politeness", () => ({
  sleep: vi.fn(async () => {}),
  randomDelayMs: vi.fn(() => 0),
  SCRAPER_USER_AGENT: "test-ua",
}));
// Keep the module-scope `new Anthropic()` in the real adapters from running.
vi.mock("@/lib/extraction/claude-haiku", () => ({
  ClaudeHaikuAdapter: class {
    extractListings = vi.fn(async () => []);
    canonicalizeRoles = vi.fn(async () => []);
  },
}));
vi.mock("@/lib/extraction/deepseek-v4-flash", () => ({
  DeepSeekV4FlashAdapter: class {
    extractListings = vi.fn(async () => []);
    canonicalizeRoles = vi.fn(async () => []);
  },
}));

const CONFIG = {
  id: "jc-1",
  title: "Développeur",
  excludedKeywords: [] as string[],
  location: "Paris",
};
const today = new Date().toISOString().slice(0, 10);

function adapter(
  roles: (string | null)[] = [],
): ExtractionAdapter & RoleCanonicalizer {
  return {
    extractListings: vi.fn(async () => []),
    canonicalizeRoles: vi.fn(async () => roles),
  };
}

function mappedListing(over: Partial<Record<string, unknown>> = {}) {
  return {
    title: "Développeur Frontend",
    company: "Doctolib SAS",
    salaryRaw: null,
    datePosted: today,
    url: "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/1W",
    ...over,
  };
}

function pageFetcher(
  pages: { listings: ReturnType<typeof mappedListing>[]; totalCount: number }[],
) {
  const fn = vi.fn();
  for (const p of pages) fn.mockResolvedValueOnce(p);
  return fn as unknown as typeof fetchApecResultsPage;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReturnValue(mockDrizzleChain([CONFIG]) as never);
  vi.mocked(db.insert).mockReturnValue(
    mockDrizzleChain([{ id: "run-1" }]) as never,
  );
  vi.mocked(resolveApecLocation).mockResolvedValue({ code: "590711" });
});

afterEach(() => {
  delete process.env.SCRAPING_KILL_SWITCH;
});

describe("runApecApiScrape — happy path", () => {
  it("fetches one page, normalizes company, canonicalizes roles, inserts listings", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const result = await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(["frontend-developer"]),
      fetchPage: pageFetcher([{ listings: [mappedListing()], totalCount: 1 }]),
    });

    expect(result).toMatchObject({
      scrapeRunId: "run-1",
      listingCount: 1,
      status: "completed",
    });
    expect(writeSiteOutcome).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        scrapeRunId: "run-1",
        site: "apec",
        outcome: "completed",
        listingCount: 1,
      }),
    );
    expect(recomputeAndWriteRunStatus).toHaveBeenCalledWith("run-1");

    const rows = insertChain.values.mock.calls
      .map((c) => c[0])
      .find((a): a is Record<string, unknown>[] => Array.isArray(a));
    expect(rows?.[0]).toMatchObject({
      companyNormalized: "doctolib",
      roleCanonical: "frontend-developer",
      site: "apec",
    });
  });

  it("scopes by the resolved lieuId", async () => {
    const fetchPage = pageFetcher([{ listings: [], totalCount: 0 }]);

    await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(),
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ lieux: ["590711"], page: 0 }),
    );
  });

  it("runs nationwide (no lieux, no resolver call) when location is absent", async () => {
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([{ ...CONFIG, location: null }]) as never,
    );
    const fetchPage = pageFetcher([{ listings: [], totalCount: 0 }]);

    await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(),
      fetchPage,
    });

    expect(resolveApecLocation).not.toHaveBeenCalled();
    expect(fetchPage).toHaveBeenCalledWith(
      expect.not.objectContaining({ lieux: expect.anything() }),
    );
  });
});

describe("runApecApiScrape — pagination", () => {
  it("loops past page 0 only while fetched < totalCount and stops at VOLUME_CAP", async () => {
    const page = (n: number) => ({
      listings: Array.from({ length: 50 }, (_, i) =>
        mappedListing({ url: `u${n}_${i}`, title: `Dev ${n}_${i}` }),
      ),
      totalCount: 200,
    });
    const fetchPage = pageFetcher([page(0), page(1), page(2), page(3)]);

    const result = await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(Array.from({ length: 50 }, () => "dev")),
      fetchPage,
    });

    // VOLUME_CAP hit on page 0 → no second fetch.
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result.listingCount).toBe(50);
  });

  it("stops after MAX_APEC_PAGES even if totalCount claims more", async () => {
    // Every page is entirely out-of-window, so `collected` never grows and
    // only the page ceiling can stop the loop.
    const stalePage = {
      listings: Array.from({ length: 50 }, (_, i) =>
        mappedListing({ url: `s${i}`, datePosted: "2020-01-01" }),
      ),
      totalCount: 100000,
    };
    const fetchPage = vi.fn().mockResolvedValue(stalePage);

    const result = await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(),
      fetchPage: fetchPage as unknown as typeof fetchApecResultsPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(5);
    expect(result.listingCount).toBe(0);
  });

  it("drops out-of-window listings", async () => {
    const fetchPage = pageFetcher([
      {
        listings: [
          mappedListing({ url: "fresh", datePosted: today }),
          mappedListing({ url: "stale", datePosted: "2020-01-01" }),
        ],
        totalCount: 2,
      },
    ]);

    const result = await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(["dev"]),
      fetchPage,
    });

    expect(result.listingCount).toBe(1);
  });
});

describe("runApecApiScrape — location unresolved", () => {
  it("skips Apec with a French note and downgrades the run, no fetch, no markSiteFailed", async () => {
    vi.mocked(resolveApecLocation).mockResolvedValue({
      code: null,
      reason: "no_match",
    });
    vi.mocked(recomputeAndWriteRunStatus).mockResolvedValueOnce(
      "partial_failure",
    );
    const fetchPage = pageFetcher([]);

    const result = await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(),
      fetchPage,
    });

    expect(fetchPage).not.toHaveBeenCalled();
    expect(markSiteFailed).not.toHaveBeenCalled();
    expect(result.status).toBe("partial_failure");
    expect(result.listingCount).toBe(0);
    expect(result.note).toContain("Paris");
    expect(result.note).toContain("Apec");
    // The unresolved-location skip records an empty_extraction outcome.
    expect(writeSiteOutcome).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ outcome: "empty_extraction", listingCount: 0 }),
    );
    expect(vi.mocked(db.insert).mock.calls.map((c) => c[0])).not.toContain(
      listing,
    );
  });
});

describe("runApecApiScrape — failure mapping", () => {
  it("flips SiteStatus to markup_broken and rethrows on a shape drift", async () => {
    const fetchPage = vi.fn(async () => {
      throw new ScrapeMarkupError("shape drift");
    });

    await expect(
      runApecApiScrape({
        site: "apec",
        payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
        extractionAdapter: adapter(),
        fetchPage: fetchPage as unknown as typeof fetchApecResultsPage,
      }),
    ).rejects.toBeInstanceOf(ScrapeMarkupError);

    expect(markSiteFailed).toHaveBeenCalledWith(
      "apec",
      "markup_broken",
      expect.any(String),
    );
    expect(vi.mocked(db.insert).mock.calls.map((c) => c[0])).not.toContain(
      listing,
    );
  });

  it("flips SiteStatus to bot_challenge and rethrows on a block", async () => {
    const fetchPage = vi.fn(async () => {
      throw new ScrapeBlockedError("challenge");
    });

    await expect(
      runApecApiScrape({
        site: "apec",
        payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
        extractionAdapter: adapter(),
        fetchPage: fetchPage as unknown as typeof fetchApecResultsPage,
      }),
    ).rejects.toBeInstanceOf(ScrapeBlockedError);

    expect(markSiteFailed).toHaveBeenCalledWith(
      "apec",
      "bot_challenge",
      expect.any(String),
    );
  });

  it("records a failed ScrapeRunSite row + recompute only when scrapeRunId is present", async () => {
    const boom = () => {
      throw new ScrapeMarkupError("shape drift");
    };

    // Standalone (no scrapeRunId): SiteStatus only.
    await expect(
      runApecApiScrape({
        site: "apec",
        payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
        extractionAdapter: adapter(),
        fetchPage: vi.fn(boom) as unknown as typeof fetchApecResultsPage,
      }),
    ).rejects.toBeInstanceOf(ScrapeMarkupError);
    expect(writeSiteOutcome).not.toHaveBeenCalled();
    expect(recomputeAndWriteRunStatus).not.toHaveBeenCalled();

    // Orchestrated (scrapeRunId present): also records the failed row.
    await expect(
      runApecApiScrape({
        site: "apec",
        payload: {
          jobConfigId: "jc-1",
          lookback: { type: "3d" },
          scrapeRunId: "run-7",
        },
        extractionAdapter: adapter(),
        fetchPage: vi.fn(boom) as unknown as typeof fetchApecResultsPage,
      }),
    ).rejects.toBeInstanceOf(ScrapeMarkupError);
    expect(writeSiteOutcome).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        scrapeRunId: "run-7",
        jobConfigId: "jc-1",
        outcome: "failed",
        failureCause: "markup_broken",
      }),
    );
    expect(recomputeAndWriteRunStatus).toHaveBeenCalledWith("run-7");
  });
});

describe("runApecApiScrape — role canonicalization degradation", () => {
  it("still inserts listings but downgrades the run when canonicalizeRoles wholesale-fails", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    vi.mocked(recomputeAndWriteRunStatus).mockResolvedValueOnce(
      "partial_failure",
    );

    const result = await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter([null]),
      fetchPage: pageFetcher([{ listings: [mappedListing()], totalCount: 1 }]),
    });

    expect(result.listingCount).toBe(1);
    expect(result.status).toBe("partial_failure");
    // Degraded extraction with rows still written -> empty_extraction outcome
    // (which combineRunStatus turns into partial_failure).
    expect(writeSiteOutcome).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ outcome: "empty_extraction", listingCount: 1 }),
    );

    const rows = insertChain.values.mock.calls
      .map((c) => c[0])
      .find((a): a is Record<string, unknown>[] => Array.isArray(a));
    expect(rows?.[0].roleCanonical).toBeNull();
  });
});

describe("runApecApiScrape — ScrapeRun lifecycle", () => {
  it("reuses a supplied scrapeRunId and does not insert a scrape_run row", async () => {
    vi.mocked(recomputeAndWriteRunStatus).mockResolvedValueOnce("running");

    const result = await runApecApiScrape({
      site: "apec",
      payload: {
        jobConfigId: "jc-1",
        lookback: { type: "3d" },
        scrapeRunId: "existing-run",
      },
      extractionAdapter: adapter(["dev"]),
      fetchPage: pageFetcher([{ listings: [mappedListing()], totalCount: 1 }]),
    });

    expect(result).toMatchObject({
      scrapeRunId: "existing-run",
      status: "running",
    });
    expect(recomputeAndWriteRunStatus).toHaveBeenCalledWith("existing-run");
    const insertedTables = vi.mocked(db.insert).mock.calls.map((c) => c[0]);
    expect(insertedTables).toContain(listing);
    expect(insertedTables).not.toContain(scrapeRun);
  });

  it("skips everything and records a partial_failure run when the kill switch is active", async () => {
    process.env.SCRAPING_KILL_SWITCH = "true";
    vi.mocked(recomputeAndWriteRunStatus).mockResolvedValueOnce(
      "partial_failure",
    );
    const fetchPage = pageFetcher([]);

    const result = await runApecApiScrape({
      site: "apec",
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapter(),
      fetchPage,
    });

    expect(result).toMatchObject({
      listingCount: 0,
      status: "partial_failure",
    });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(resolveApecLocation).not.toHaveBeenCalled();
    expect(markSiteFailed).not.toHaveBeenCalled();
  });
});
