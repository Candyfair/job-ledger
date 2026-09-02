import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tasks } from "@trigger.dev/sdk/v3";
import { POST } from "./route";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { checkTriggerRateLimit } from "@/lib/rate-limit/trigger-rate-limit";
import { mockDrizzleChain } from "@/lib/test/mock-db";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/lib/require-session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/rate-limit/trigger-rate-limit", () => ({
  checkTriggerRateLimit: vi.fn(),
}));

vi.mock("@trigger.dev/sdk/v3", () => ({
  tasks: { trigger: vi.fn() },
}));

const authSession = { user: { id: "user-1" } };

function triggerRequest(body: unknown) {
  return new Request("http://localhost/api/scrape/trigger", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkTriggerRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(tasks.trigger).mockResolvedValue({} as never);
});

describe("POST /api/scrape/trigger — authenticated", () => {
  it("creates a ScrapeRun and invokes one task per (site, resolved jobConfig) pair", async () => {
    vi.mocked(requireSession).mockResolvedValue(authSession as never);
    // Caller asked for 3 ids; only 2 belong to them. The fan-out must be
    // sized off the resolved (post-ownership-filter) count, not the 3 the
    // caller sent.
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([{ id: "jc-1" }, { id: "jc-2" }]) as never,
    );
    vi.mocked(db.insert).mockReturnValue(
      mockDrizzleChain([{ id: "run-1" }]) as never,
    );

    const res = await POST(
      triggerRequest({
        lookbackWindow: "24h",
        sites: ["apec", "hellowork"],
        model: "claude_haiku",
        jobConfigIds: ["jc-1", "jc-2", "jc-not-owned"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ runId: "run-1" });
    expect(tasks.trigger).toHaveBeenCalledTimes(4); // 2 sites x 2 resolved configs
  });

  it("returns 400 when jobConfigIds is missing or empty, ignoring adHocSearch", async () => {
    vi.mocked(requireSession).mockResolvedValue(authSession as never);

    const res = await POST(
      triggerRequest({
        lookbackWindow: "24h",
        sites: ["apec"],
        model: "claude_haiku",
        adHocSearch: { title: "Dev", excludedKeywords: ["react"] },
      }),
    );

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
    expect(tasks.trigger).not.toHaveBeenCalled();
  });

  it("returns 400 when none of the supplied jobConfigIds belong to the caller", async () => {
    vi.mocked(requireSession).mockResolvedValue(authSession as never);
    vi.mocked(db.select).mockReturnValue(mockDrizzleChain([]) as never);

    const res = await POST(
      triggerRequest({
        lookbackWindow: "24h",
        sites: ["apec"],
        model: "claude_haiku",
        jobConfigIds: ["jc-not-owned"],
      }),
    );

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/scrape/trigger — anonymous", () => {
  it("creates a ScrapeRun and invokes one task per site, ignoring jobConfigIds", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    vi.mocked(db.insert).mockReturnValue(
      mockDrizzleChain([{ id: "run-2" }]) as never,
    );

    const res = await POST(
      triggerRequest({
        lookbackWindow: "3d",
        sites: ["apec"],
        model: "claude_haiku",
        adHocSearch: {
          title: "Dev",
          excludedKeywords: ["react"],
          location: "Lyon",
        },
        jobConfigIds: ["jc-1"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ runId: "run-2" });
    expect(db.select).not.toHaveBeenCalled();
    expect(tasks.trigger).toHaveBeenCalledTimes(1);
    expect(tasks.trigger).toHaveBeenCalledWith(
      "scrape-apec",
      expect.objectContaining({
        adHocConfig: {
          title: "Dev",
          excludedKeywords: ["react"],
          location: "Lyon",
        },
      }),
    );
  });

  it("creates a ScrapeRun when adHocSearch.location is omitted (location is optional)", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    vi.mocked(db.insert).mockReturnValue(
      mockDrizzleChain([{ id: "run-4" }]) as never,
    );

    const res = await POST(
      triggerRequest({
        lookbackWindow: "3d",
        sites: ["apec"],
        model: "claude_haiku",
        adHocSearch: { title: "Dev", excludedKeywords: ["react"] },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ runId: "run-4" });
    expect(tasks.trigger).toHaveBeenCalledWith(
      "scrape-apec",
      expect.objectContaining({
        adHocConfig: {
          title: "Dev",
          excludedKeywords: ["react"],
          location: null,
        },
      }),
    );
  });

  it("creates a ScrapeRun when adHocSearch has only a title (excludedKeywords is optional)", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    vi.mocked(db.insert).mockReturnValue(
      mockDrizzleChain([{ id: "run-5" }]) as never,
    );

    const res = await POST(
      triggerRequest({
        lookbackWindow: "3d",
        sites: ["apec"],
        model: "claude_haiku",
        adHocSearch: { title: "Dev" },
      }),
    );

    expect(res.status).toBe(201);
    expect(tasks.trigger).toHaveBeenCalledWith(
      "scrape-apec",
      expect.objectContaining({
        adHocConfig: { title: "Dev", excludedKeywords: [], location: null },
      }),
    );
  });

  it("returns 400 when adHocSearch is missing", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);

    const res = await POST(
      triggerRequest({
        lookbackWindow: "3d",
        sites: ["apec"],
        model: "claude_haiku",
        jobConfigIds: ["jc-1"],
      }),
    );

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
    expect(tasks.trigger).not.toHaveBeenCalled();
  });
});

describe("POST /api/scrape/trigger — model validation", () => {
  it("returns 400 for a model that isn't a recognized ModelUsed value", async () => {
    const res = await POST(
      triggerRequest({
        lookbackWindow: "24h",
        sites: ["apec"],
        model: "gpt-4",
        jobConfigIds: ["jc-1"],
      }),
    );

    expect(res.status).toBe(400);
    expect(requireSession).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts deepseek_v4_flash now that it has an implemented adapter", async () => {
    vi.mocked(requireSession).mockResolvedValue(authSession as never);
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([{ id: "jc-1" }]) as never,
    );
    vi.mocked(db.insert).mockReturnValue(
      mockDrizzleChain([{ id: "run-3" }]) as never,
    );

    const res = await POST(
      triggerRequest({
        lookbackWindow: "24h",
        sites: ["apec"],
        model: "deepseek_v4_flash",
        jobConfigIds: ["jc-1"],
      }),
    );

    expect(res.status).toBe(201);
    expect(tasks.trigger).toHaveBeenCalledWith(
      "scrape-apec",
      expect.objectContaining({ model: "deepseek_v4_flash" }),
    );
  });
});

describe("POST /api/scrape/trigger — rate limiting", () => {
  it("returns 429 and never creates a ScrapeRun when the IP is rate-limited", async () => {
    vi.mocked(checkTriggerRateLimit).mockResolvedValue({ allowed: false });

    const res = await POST(
      triggerRequest({
        lookbackWindow: "24h",
        sites: ["apec"],
        model: "claude_haiku",
        jobConfigIds: ["jc-1"],
      }),
    );

    expect(res.status).toBe(429);
    expect(db.insert).not.toHaveBeenCalled();
    expect(tasks.trigger).not.toHaveBeenCalled();
  });
});

describe("POST /api/scrape/trigger — kill switch", () => {
  const ORIGINAL = process.env.SCRAPING_KILL_SWITCH;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.SCRAPING_KILL_SWITCH;
    } else {
      process.env.SCRAPING_KILL_SWITCH = ORIGINAL;
    }
  });

  it("returns 503 before checking the rate limit or touching the database", async () => {
    process.env.SCRAPING_KILL_SWITCH = "true";

    const res = await POST(
      triggerRequest({
        lookbackWindow: "24h",
        sites: ["apec"],
        model: "claude_haiku",
        jobConfigIds: ["jc-1"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Scraping is temporarily disabled by the administrator",
    });
    expect(checkTriggerRateLimit).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(tasks.trigger).not.toHaveBeenCalled();
  });
});
