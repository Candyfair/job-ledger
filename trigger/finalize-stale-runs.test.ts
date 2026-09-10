import { describe, it, expect, vi, beforeEach } from "vitest";
import { lt, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun, scrapeRunSite } from "@/drizzle/schema";
import { recomputeAndWriteRunStatus } from "@/lib/run-status";
import { mockDrizzleChain } from "@/lib/test/mock-db";
import { finalizeStaleRuns } from "./finalize-stale-runs";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/run-status", () => ({
  recomputeAndWriteRunStatus: vi.fn(async () => "partial_failure"),
}));

// The schedule wrapper pulls in the Trigger.dev SDK; stub it so importing the
// module under test never touches the real runtime.
vi.mock("@trigger.dev/sdk/v3", () => ({
  schedules: { task: (config: unknown) => config },
}));

// Spy on the comparison builders while keeping their real behavior, so the
// test can assert which columns and cutoff the sweep filters on.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, lt: vi.fn(actual.lt), eq: vi.fn(actual.eq) };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recomputeAndWriteRunStatus).mockResolvedValue("partial_failure");
  vi.mocked(db.update).mockReturnValue(mockDrizzleChain([]) as never);
});

describe("finalizeStaleRuns", () => {
  it("flags each stale run's pending rows as failed/timeout, then recomputes", async () => {
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([{ id: "run-a" }, { id: "run-b" }]) as never,
    );

    const now = new Date("2026-09-07T12:00:00.000Z");
    const result = await finalizeStaleRuns(now);

    // Selects on status = 'running' and triggered_at < now - 15 min.
    expect(vi.mocked(eq)).toHaveBeenCalledWith(scrapeRun.status, "running");
    const [column, cutoff] = vi.mocked(lt).mock.calls[0];
    expect(column).toBe(scrapeRun.triggeredAt);
    expect((cutoff as Date).toISOString()).toBe("2026-09-07T11:45:00.000Z");

    // One update per stale run, over its still-pending ScrapeRunSite rows.
    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(db.update)).toHaveBeenCalledWith(scrapeRunSite);
    const updateChain = vi.mocked(db.update).mock.results[0].value;
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", failureCause: "timeout" }),
    );
    expect(vi.mocked(eq)).toHaveBeenCalledWith(
      scrapeRunSite.outcome,
      "pending",
    );

    // Recompute is the only writer of ScrapeRun.status — called per run.
    expect(recomputeAndWriteRunStatus).toHaveBeenCalledWith("run-a");
    expect(recomputeAndWriteRunStatus).toHaveBeenCalledWith("run-b");

    expect(result).toEqual({ finalized: 2 });
  });

  it("counts only runs the recompute actually moved off 'running'", async () => {
    vi.mocked(db.select).mockReturnValue(
      mockDrizzleChain([{ id: "run-a" }, { id: "run-b" }]) as never,
    );
    vi.mocked(recomputeAndWriteRunStatus)
      .mockResolvedValueOnce("partial_failure")
      .mockResolvedValueOnce("running");

    const result = await finalizeStaleRuns(
      new Date("2026-09-07T12:00:00.000Z"),
    );

    expect(result).toEqual({ finalized: 1 });
  });

  it("does nothing when no run is stale", async () => {
    vi.mocked(db.select).mockReturnValue(mockDrizzleChain([]) as never);

    const result = await finalizeStaleRuns(
      new Date("2026-09-07T12:00:00.000Z"),
    );

    expect(db.update).not.toHaveBeenCalled();
    expect(recomputeAndWriteRunStatus).not.toHaveBeenCalled();
    expect(result).toEqual({ finalized: 0 });
  });
});
