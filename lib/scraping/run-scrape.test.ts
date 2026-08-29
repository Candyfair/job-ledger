import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { scrapeRun, listing } from "@/drizzle/schema";
import { mockDrizzleChain } from "@/lib/test/mock-db";
import { markSiteFailed } from "./site-status";
import { ScrapeBlockedError, ScrapeMarkupError } from "./errors";
import { runSiteScrape, type CaptureSitePage } from "./run-scrape";
import type { ExtractionAdapter } from "@/lib/extraction/adapter";

const browserClose = vi.fn();

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: vi.fn(async () => ({})),
      close: browserClose,
    })),
  },
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

// Keeps the module-scope `new Anthropic()` in the real adapter from running
// at import time — every test injects its own adapter anyway.
vi.mock("@/lib/extraction/claude-haiku", () => ({
  ClaudeHaikuAdapter: class {
    extractListings = vi.fn(async () => []);
  },
}));

vi.mock("./site-status", () => ({ markSiteFailed: vi.fn() }));

const CONFIG = { id: "jc-1", keywords: ["dev"], location: "Paris" };
const today = new Date().toISOString().slice(0, 10);

function adapterReturning(
  entries: Awaited<ReturnType<ExtractionAdapter["extractListings"]>>,
): ExtractionAdapter {
  return { extractListings: vi.fn(async () => entries) };
}

const onePageCapture: CaptureSitePage = vi.fn(async () => ({
  listings: [{ listingId: "l0_0", url: "https://apec.fr/1", rawText: "raw" }],
  hasMore: false,
}));

const oneExtractedEntry = [
  {
    listingId: "l0_0",
    title: "Développeur",
    company: null,
    companyNormalized: null,
    roleCanonical: null,
    datePosted: today,
    salaryRaw: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReturnValue(mockDrizzleChain([CONFIG]) as never);
  vi.mocked(db.insert).mockReturnValue(
    mockDrizzleChain([{ id: "run-1" }]) as never,
  );
});

describe("runSiteScrape — failure path", () => {
  it("marks the site as bot_challenge and re-throws on ScrapeBlockedError", async () => {
    const capturePage: CaptureSitePage = vi.fn(async () => {
      throw new ScrapeBlockedError("challenge");
    });

    await expect(
      runSiteScrape({
        site: "apec",
        capturePage,
        payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
        extractionAdapter: adapterReturning([]),
      }),
    ).rejects.toThrow(ScrapeBlockedError);

    expect(browserClose).toHaveBeenCalled();
    expect(markSiteFailed).toHaveBeenCalledWith(
      "apec",
      "bot_challenge",
      expect.stringContaining("Apec.fr"),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("marks the site as markup_broken and re-throws on a generic selector error", async () => {
    const capturePage: CaptureSitePage = vi.fn(async () => {
      throw new ScrapeMarkupError("selector missing");
    });

    await expect(
      runSiteScrape({
        site: "hellowork",
        capturePage,
        payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
        extractionAdapter: adapterReturning([]),
      }),
    ).rejects.toThrow(ScrapeMarkupError);

    expect(markSiteFailed).toHaveBeenCalledWith(
      "hellowork",
      "markup_broken",
      expect.any(String),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("runSiteScrape — ScrapeRun reuse vs create", () => {
  it("creates a ScrapeRun and tags listings with the new id when scrapeRunId is absent", async () => {
    const result = await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapterReturning(oneExtractedEntry),
    });

    expect(result).toMatchObject({
      scrapeRunId: "run-1",
      listingCount: 1,
      status: "completed",
    });

    const insertedTables = vi.mocked(db.insert).mock.calls.map((c) => c[0]);
    expect(insertedTables).toContain(scrapeRun);
    expect(insertedTables).toContain(listing);
  });

  it("reuses the supplied ScrapeRun id and does not insert a scrape_run row", async () => {
    const result = await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      payload: {
        jobConfigId: "jc-1",
        lookback: { type: "3d" },
        scrapeRunId: "existing-run",
      },
      extractionAdapter: adapterReturning(oneExtractedEntry),
    });

    expect(result).toMatchObject({
      scrapeRunId: "existing-run",
      listingCount: 1,
      status: null,
    });

    const insertedTables = vi.mocked(db.insert).mock.calls.map((c) => c[0]);
    expect(insertedTables).toContain(listing);
    expect(insertedTables).not.toContain(scrapeRun);
  });

  it("does not insert listings when nothing lands in the lookback window", async () => {
    const stale = [{ ...oneExtractedEntry[0], datePosted: "2020-01-01" }];

    const result = await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapterReturning(stale),
    });

    expect(result.listingCount).toBe(0);
    const insertedTables = vi.mocked(db.insert).mock.calls.map((c) => c[0]);
    expect(insertedTables).toContain(scrapeRun);
    expect(insertedTables).not.toContain(listing);
  });
});

describe("runSiteScrape — VOLUME_CAP enforcement (SPEC.md §7)", () => {
  function makeCaptured(count: number, prefix: string) {
    return Array.from({ length: count }, (_, i) => ({
      listingId: `${prefix}_${i}`,
      url: `https://apec.fr/${prefix}_${i}`,
      rawText: "raw",
    }));
  }

  function extractedFor(captured: { listingId: string }[]) {
    return captured.map((c) => ({
      listingId: c.listingId,
      title: "Développeur",
      company: null,
      companyNormalized: null,
      roleCanonical: null,
      datePosted: today,
      salaryRaw: null,
    }));
  }

  it("truncates mid-page once the cap is reached and does not fetch a further page", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    // Page 1 lands 40 in-window listings (under the cap); page 2 lands 20
    // more, which would carry `collected` from 40 to 60 if nothing stopped
    // it mid-page. A third page is queued behind `hasMore: true` on page 2
    // and must never be fetched.
    const page1 = makeCaptured(40, "p0");
    const page2 = makeCaptured(20, "p1");
    const page3 = makeCaptured(5, "p2");

    const capturePage: CaptureSitePage = vi
      .fn()
      .mockResolvedValueOnce({ listings: page1, hasMore: true })
      .mockResolvedValueOnce({ listings: page2, hasMore: true })
      .mockResolvedValueOnce({ listings: page3, hasMore: false });

    const extractionAdapter: ExtractionAdapter = {
      extractListings: vi
        .fn()
        .mockResolvedValueOnce(extractedFor(page1))
        .mockResolvedValueOnce(extractedFor(page2))
        .mockResolvedValueOnce(extractedFor(page3)),
    };

    const result = await runSiteScrape({
      site: "apec",
      capturePage,
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter,
    });

    expect(result.listingCount).toBe(50);
    expect(capturePage).toHaveBeenCalledTimes(2);

    const insertedRows = insertChain.values.mock.calls
      .map((call) => call[0])
      .find((arg): arg is unknown[] => Array.isArray(arg));
    expect(insertedRows).toHaveLength(50);
  });
});
