import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRunStatusPolling } from "./useRunStatusPolling";
import type { RunStatusPayload } from "@/lib/dashboard/derive-run-status";

function makeStatus(overrides: Partial<RunStatusPayload>): RunStatusPayload {
  return {
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
    ...overrides,
  };
}

// vi.advanceTimersByTimeAsync alone doesn't guarantee React flushes state
// updates that land inside a fetch().then() microtask chain triggered by
// the fake timer — wrapping in act() is what actually forces that flush.
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRunStatusPolling — stops polling once a run resolves", () => {
  it("does not poll when the initial status is not running", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRunStatusPolling("run-1", makeStatus({ status: "completed" })),
    );

    await tick(20000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not poll when runId is null", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useRunStatusPolling(null, makeStatus({})));

    await tick(20000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls on an interval while running and stops once the response resolves", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeStatus({ status: "running" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeStatus({ status: "completed" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useRunStatusPolling("run-1", makeStatus({ status: "running" })),
    );

    await tick(4000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current?.status).toBe("running");

    await tick(4000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current?.status).toBe("completed");

    // A further tick must not poll again — the run already resolved.
    await tick(8000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops polling once the safety cutoff elapses even if never resolved", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeStatus({ status: "running" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() =>
      useRunStatusPolling("run-1", makeStatus({ status: "running" })),
    );

    // Advance well past the 12-minute safety cutoff.
    await tick(13 * 60 * 1000);

    const callsAtCutoff = fetchMock.mock.calls.length;
    expect(callsAtCutoff).toBeGreaterThan(0);

    await tick(60000);
    expect(fetchMock.mock.calls.length).toBe(callsAtCutoff);
  });
});
