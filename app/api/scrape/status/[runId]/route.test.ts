import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { requireSession } from "@/lib/require-session";
import { getRunStatus } from "@/lib/dashboard/get-run-status";
import type { RunStatusPayload } from "@/lib/dashboard/derive-run-status";

vi.mock("@/lib/require-session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/dashboard/get-run-status", () => ({
  getRunStatus: vi.fn(),
}));

const session = { user: { id: "user-1" } };

const payload: RunStatusPayload = {
  runId: "run-1",
  status: "running",
  statusBasis: "derived",
  triggeredAt: "2026-08-21T09:00:00.000Z",
  model: "claude_haiku",
  sitesIncluded: ["apec"],
  sites: [],
  kept: 0,
  excluded: 0,
  duplicateGroups: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * `getRunStatus` (mocked here) owns the composed ownership rule itself —
 * this test only verifies the route's own contract: 200 with the payload
 * when a caller is allowed to see the run, 404 (never any other code)
 * otherwise, regardless of whether that's "doesn't exist" or "not theirs".
 */
describe("GET /api/scrape/status/:runId", () => {
  it("returns 404 when getRunStatus resolves null for an anonymous caller", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    vi.mocked(getRunStatus).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/scrape/status/run-1"),
      {
        params: Promise.resolve({ runId: "run-1" }),
      },
    );

    expect(res.status).toBe(404);
    expect(getRunStatus).toHaveBeenCalledWith("run-1", null);
  });

  it("returns 200 with the derived payload for a public run seen anonymously", async () => {
    vi.mocked(requireSession).mockResolvedValue(null);
    vi.mocked(getRunStatus).mockResolvedValue(payload);

    const res = await GET(
      new Request("http://localhost/api/scrape/status/run-1"),
      {
        params: Promise.resolve({ runId: "run-1" }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(payload);
  });

  it("returns 404 for an authenticated caller viewing a run getRunStatus rejects (not theirs)", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    vi.mocked(getRunStatus).mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/scrape/status/run-2"),
      {
        params: Promise.resolve({ runId: "run-2" }),
      },
    );

    expect(res.status).toBe(404);
    expect(getRunStatus).toHaveBeenCalledWith("run-2", session);
  });

  it("returns 200 for an authenticated caller viewing their own run", async () => {
    vi.mocked(requireSession).mockResolvedValue(session as never);
    vi.mocked(getRunStatus).mockResolvedValue(payload);

    const res = await GET(
      new Request("http://localhost/api/scrape/status/run-1"),
      {
        params: Promise.resolve({ runId: "run-1" }),
      },
    );

    expect(res.status).toBe(200);
    expect(getRunStatus).toHaveBeenCalledWith("run-1", session);
  });
});
