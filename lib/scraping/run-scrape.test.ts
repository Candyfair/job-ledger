import { describe, it, expect, vi, beforeEach } from "vitest";
import { isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun, listing, exclusionKeyword } from "@/drizzle/schema";
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
  // First `db.select()` call is the `jobConfig` lookup; every subsequent
  // call (the `exclusionKeyword` fetch) defaults to an empty list so
  // pre-existing tests that don't care about exclusions see no keywords.
  vi.mocked(db.select)
    .mockReturnValueOnce(mockDrizzleChain([CONFIG]) as never)
    .mockReturnValue(mockDrizzleChain([]) as never);
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

describe("runSiteScrape — exclusion-keyword tagging", () => {
  it("tags a listing whose title matches a configured keyword, preserving casing", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    vi.mocked(db.select).mockReturnValueOnce(
      mockDrizzleChain([{ keyword: "PHP" }]) as never,
    );

    const entries = [{ ...oneExtractedEntry[0], title: "Développeur PHP" }];

    await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" }, userId: "u-1" },
      extractionAdapter: adapterReturning(entries),
    });

    const insertedRows = insertChain.values.mock.calls
      .map((call) => call[0])
      .find((arg): arg is { title: string; excludedByKeyword: string[] }[] =>
        Array.isArray(arg),
      );
    expect(insertedRows?.[0].excludedByKeyword).toEqual(["PHP"]);
  });

  it("gives a non-matching listing an empty excludedByKeyword array", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    vi.mocked(db.select).mockReturnValueOnce(
      mockDrizzleChain([{ keyword: "Manager" }]) as never,
    );

    await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" }, userId: "u-1" },
      extractionAdapter: adapterReturning(oneExtractedEntry),
    });

    const insertedRows = insertChain.values.mock.calls
      .map((call) => call[0])
      .find((arg): arg is { title: string; excludedByKeyword: string[] }[] =>
        Array.isArray(arg),
      );
    expect(insertedRows?.[0].excludedByKeyword).toEqual([]);
  });

  it("scopes the exclusion-keyword query to userId IS NULL when payload.userId is omitted", async () => {
    // `beforeEach` already queues one return value for `db.select`; reset
    // here so this test's two calls (jobConfig, then exclusionKeyword) are
    // fully controlled and nothing leaks into the next test.
    const exclusionSelectChain = mockDrizzleChain([]);
    vi.mocked(db.select).mockReset();
    vi.mocked(db.select)
      .mockReturnValueOnce(mockDrizzleChain([CONFIG]) as never)
      .mockReturnValueOnce(exclusionSelectChain as never);

    await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      // userId intentionally omitted — anonymous run.
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapterReturning(oneExtractedEntry),
    });

    const fromChain = exclusionSelectChain.from.mock.results[0]
      .value as ReturnType<typeof mockDrizzleChain>;
    const whereArg = fromChain.where.mock.calls[0][0];
    expect(whereArg).toEqual(isNull(exclusionKeyword.userId));
  });

  it("fetches the exclusion-keyword list exactly once per call, not once per listing", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    // Reset for the same reason as the test above — full control over both
    // of this test's `db.select` calls.
    vi.mocked(db.select).mockReset();
    vi.mocked(db.select)
      .mockReturnValueOnce(mockDrizzleChain([CONFIG]) as never)
      .mockReturnValueOnce(mockDrizzleChain([{ keyword: "PHP" }]) as never);

    const captured = [
      { listingId: "l0_0", url: "https://apec.fr/1", rawText: "raw" },
      { listingId: "l0_1", url: "https://apec.fr/2", rawText: "raw" },
      { listingId: "l0_2", url: "https://apec.fr/3", rawText: "raw" },
    ];
    const capturePage: CaptureSitePage = vi.fn(async () => ({
      listings: captured,
      hasMore: false,
    }));
    const entries = captured.map((c) => ({
      ...oneExtractedEntry[0],
      listingId: c.listingId,
    }));

    await runSiteScrape({
      site: "apec",
      capturePage,
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" }, userId: "u-1" },
      extractionAdapter: adapterReturning(entries),
    });

    // One call for the `jobConfig` lookup, one for the `exclusionKeyword`
    // fetch — never one per collected listing.
    expect(db.select).toHaveBeenCalledTimes(2);
  });
});

describe("runSiteScrape — jobConfigId / adHocConfig exclusivity", () => {
  it("throws when both jobConfigId and adHocConfig are set", async () => {
    await expect(
      runSiteScrape({
        site: "apec",
        capturePage: onePageCapture,
        payload: {
          jobConfigId: "jc-1",
          adHocConfig: { keywords: ["dev"] },
          lookback: { type: "3d" },
        },
        extractionAdapter: adapterReturning([]),
      }),
    ).rejects.toThrow(
      "runSiteScrape requires exactly one of payload.jobConfigId or payload.adHocConfig",
    );
  });

  it("throws when neither jobConfigId nor adHocConfig is set", async () => {
    await expect(
      runSiteScrape({
        site: "apec",
        capturePage: onePageCapture,
        payload: { lookback: { type: "3d" } },
        extractionAdapter: adapterReturning([]),
      }),
    ).rejects.toThrow(
      "runSiteScrape requires exactly one of payload.jobConfigId or payload.adHocConfig",
    );
  });
});

describe("runSiteScrape — anonymous ad-hoc search", () => {
  it("uses adHocConfig directly, skipping the jobConfig lookup, and stores an empty jobConfigsIncluded", async () => {
    // No jobConfig lookup on this path, so `db.select` is only ever called
    // for the exclusionKeyword fetch — reset beforeEach's queue so the
    // single call resolves to an empty exclusion list, not the CONFIG row.
    vi.mocked(db.select).mockReset();
    vi.mocked(db.select).mockReturnValue(mockDrizzleChain([]) as never);

    const capturePage: CaptureSitePage = vi.fn(async (_page, params) => {
      expect(params.keywords).toBe("react native");
      expect(params.location).toBe("Lyon");
      return { listings: [], hasMore: false };
    });

    const result = await runSiteScrape({
      site: "apec",
      capturePage,
      payload: {
        adHocConfig: { keywords: ["react", "native"], location: "Lyon" },
        lookback: { type: "3d" },
      },
      extractionAdapter: adapterReturning([]),
    });

    expect(result.scrapeRunId).toBe("run-1");
    expect(db.select).toHaveBeenCalledTimes(1);

    const scrapeRunInsertCall = vi
      .mocked(db.insert)
      .mock.calls.find((call) => call[0] === scrapeRun);
    expect(scrapeRunInsertCall).toBeDefined();
  });
});

describe("runSiteScrape — model selection", () => {
  it("defaults to claude_haiku on ScrapeRun.modelUsed when payload.model is omitted", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      payload: { jobConfigId: "jc-1", lookback: { type: "3d" } },
      extractionAdapter: adapterReturning(oneExtractedEntry),
    });

    const scrapeRunValues = insertChain.values.mock.calls
      .map((call) => call[0])
      .find(
        (arg): arg is { modelUsed: string } =>
          !!arg && typeof arg === "object" && "modelUsed" in arg,
      );
    expect(scrapeRunValues?.modelUsed).toBe("claude_haiku");
  });

  it("writes payload.model to ScrapeRun.modelUsed when supplied", async () => {
    const insertChain = mockDrizzleChain([{ id: "run-1" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    // Deliberately not "claude_haiku" (the default): with the same value as
    // the default this test can't tell payload.model actually flowed through
    // from hardcoding. extractionAdapter is injected here, so the
    // getExtractionAdapter(...) not-implemented throw for deepseek_v4_flash
    // is never reached — only ScrapeRun.modelUsed is under test.
    await runSiteScrape({
      site: "apec",
      capturePage: onePageCapture,
      payload: {
        jobConfigId: "jc-1",
        lookback: { type: "3d" },
        model: "deepseek_v4_flash",
      },
      extractionAdapter: adapterReturning(oneExtractedEntry),
    });

    const scrapeRunValues = insertChain.values.mock.calls
      .map((call) => call[0])
      .find(
        (arg): arg is { modelUsed: string } =>
          !!arg && typeof arg === "object" && "modelUsed" in arg,
      );
    expect(scrapeRunValues?.modelUsed).toBe("deepseek_v4_flash");
  });
});
