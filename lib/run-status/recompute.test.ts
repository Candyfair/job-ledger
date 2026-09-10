import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { scrapeRun } from "@/drizzle/schema";
import { mockDrizzleChain } from "@/lib/test/mock-db";
import { recomputeAndWriteRunStatus } from "./recompute";
import type { Outcome } from "./combine";

vi.mock("@/lib/db", () => {
  // The recompute runs entirely inside one transaction; the tx handle has the
  // same query surface as `db`, so the mock just hands `db` back to the
  // callback.
  const dbMock: Record<string, unknown> = { select: vi.fn(), update: vi.fn() };
  dbMock.transaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
    cb(dbMock),
  );
  return { db: dbMock };
});

type SiteRow = { site: string; outcome: Outcome };

/**
 * Wires `db.select` to return, in order: the locked `ScrapeRun` row, then the
 * run's `ScrapeRunSite` rows. Returns the run-row chain so a test can assert
 * the `FOR UPDATE` lock.
 */
function primeSelect(currentStatus: string, siteRows: SiteRow[]) {
  const runChain = mockDrizzleChain([{ status: currentStatus }]);
  const rowsChain = mockDrizzleChain(siteRows);
  vi.mocked(db.select)
    .mockReturnValueOnce(runChain as never)
    .mockReturnValueOnce(rowsChain as never);
  return runChain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.update).mockReturnValue(mockDrizzleChain([]) as never);
});

describe("recomputeAndWriteRunStatus", () => {
  it("groups rows by site, applies both combine tiers, and writes the result", async () => {
    primeSelect("running", [
      { site: "apec", outcome: "completed" },
      { site: "apec", outcome: "failed" }, // site apec -> failed
      { site: "hellowork", outcome: "completed" }, // site hellowork -> completed
    ]);

    const result = await recomputeAndWriteRunStatus("run-1");

    // combineRunStatus(["failed", "completed"]) -> partial_failure
    expect(result).toBe("partial_failure");
    const updateChain = vi.mocked(db.update).mock.results[0].value;
    expect(updateChain.set).toHaveBeenCalledWith({ status: "partial_failure" });
    expect(vi.mocked(db.update)).toHaveBeenCalledWith(scrapeRun);
  });

  it("does not write when the recomputed status equals the stored one", async () => {
    primeSelect("completed", [
      { site: "apec", outcome: "completed" },
      { site: "hellowork", outcome: "completed" },
    ]);

    const result = await recomputeAndWriteRunStatus("run-1");

    expect(result).toBe("completed");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("takes a FOR UPDATE row lock on the ScrapeRun row", async () => {
    const runChain = primeSelect("running", [
      { site: "apec", outcome: "completed" },
      { site: "hellowork", outcome: "completed" },
    ]);

    await recomputeAndWriteRunStatus("run-1");

    expect(runChain.for).toHaveBeenCalledWith("update");
  });

  it("no-ops when the run has no ScrapeRunSite rows yet", async () => {
    primeSelect("running", []);

    const result = await recomputeAndWriteRunStatus("run-1");

    expect(result).toBe("running");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("is order-independent across 3+ tasks over 2 sites with mixed jobConfigs", async () => {
    const rows: SiteRow[] = [
      { site: "apec", outcome: "completed" }, // apec / jc-1
      { site: "apec", outcome: "empty_extraction" }, // apec / jc-2
      { site: "hellowork", outcome: "completed" }, // hellowork / jc-1
      { site: "hellowork", outcome: "completed" }, // hellowork / jc-2
    ];

    primeSelect("running", rows);
    const forward = await recomputeAndWriteRunStatus("run-1");

    vi.clearAllMocks();
    vi.mocked(db.update).mockReturnValue(mockDrizzleChain([]) as never);
    primeSelect("running", [...rows].reverse());
    const reversed = await recomputeAndWriteRunStatus("run-1");

    // apec -> empty_extraction, hellowork -> completed => partial_failure
    expect(forward).toBe("partial_failure");
    expect(reversed).toBe(forward);
  });
});
