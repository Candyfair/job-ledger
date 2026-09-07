import { describe, it, expect, vi, beforeEach } from "vitest";
import { lt, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun } from "@/drizzle/schema";
import { mockDrizzleChain } from "@/lib/test/mock-db";
import { finalizeStaleRuns } from "./finalize-stale-runs";

vi.mock("@/lib/db", () => ({
  db: { update: vi.fn() },
}));

// The schedule wrapper pulls in the Trigger.dev SDK; stub it so importing the
// module under test never touches the real runtime.
vi.mock("@trigger.dev/sdk/v3", () => ({
  schedules: { task: (config: unknown) => config },
}));

// Spy on the comparison builders while keeping their real behavior, so the
// test can assert which column and cutoff the sweep filters on.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, lt: vi.fn(actual.lt), eq: vi.fn(actual.eq) };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("finalizeStaleRuns", () => {
  it("moves only `running` rows older than 15 minutes to partial_failure", async () => {
    const chain = mockDrizzleChain([{ id: "run-a" }, { id: "run-b" }]);
    vi.mocked(db.update).mockReturnValue(chain as never);

    const now = new Date("2026-09-07T12:00:00.000Z");
    const result = await finalizeStaleRuns(now);

    // Writes the status column only.
    expect(vi.mocked(chain.set).mock.calls[0][0]).toEqual({
      status: "partial_failure",
    });

    // Filters on status = 'running'.
    expect(vi.mocked(eq)).toHaveBeenCalledWith(scrapeRun.status, "running");

    // Filters on triggered_at < now - 15 min.
    const [column, cutoff] = vi.mocked(lt).mock.calls[0];
    expect(column).toBe(scrapeRun.triggeredAt);
    expect(cutoff).toBeInstanceOf(Date);
    expect((cutoff as Date).toISOString()).toBe("2026-09-07T11:45:00.000Z");

    // Counts the rows .returning() reported.
    expect(result).toEqual({ finalized: 2 });
  });

  it("reports zero and writes nothing meaningful once the backlog is drained", async () => {
    const chain = mockDrizzleChain([]);
    vi.mocked(db.update).mockReturnValue(chain as never);

    const result = await finalizeStaleRuns(
      new Date("2026-09-07T12:00:00.000Z"),
    );

    expect(result).toEqual({ finalized: 0 });
  });
});
