import { describe, it, expect } from "vitest";
import { combineSiteOutcome, combineRunStatus, type Outcome } from "./combine";

const ALL: Outcome[] = [
  "pending",
  "failed",
  "empty_extraction",
  "completed",
  "skipped",
];

// Highest-precedence outcome present wins.
const SITE_PRECEDENCE: Outcome[] = [
  "pending",
  "failed",
  "empty_extraction",
  "completed",
  "skipped",
];

describe("combineSiteOutcome", () => {
  it("returns the single row's own outcome (anonymous / one-jobConfig case)", () => {
    for (const outcome of ALL) {
      expect(combineSiteOutcome([outcome])).toBe(outcome);
    }
  });

  it("applies precedence pending > failed > empty_extraction > completed > skipped for every pair", () => {
    for (let i = 0; i < SITE_PRECEDENCE.length; i++) {
      for (let j = 0; j < SITE_PRECEDENCE.length; j++) {
        const winner = SITE_PRECEDENCE[Math.min(i, j)];
        expect(
          combineSiteOutcome([SITE_PRECEDENCE[i], SITE_PRECEDENCE[j]]),
        ).toBe(winner);
      }
    }
  });

  it("is order-independent", () => {
    const input: Outcome[] = ["skipped", "completed", "failed", "pending"];
    const reversed = [...input].reverse();
    expect(combineSiteOutcome(input)).toBe(combineSiteOutcome(reversed));
    expect(combineSiteOutcome(input)).toBe("pending");
  });

  it("ignores duplicates", () => {
    expect(
      combineSiteOutcome(["completed", "completed", "empty_extraction"]),
    ).toBe("empty_extraction");
  });

  it("defensively returns pending for an empty input", () => {
    expect(combineSiteOutcome([])).toBe("pending");
  });
});

describe("combineRunStatus", () => {
  it("any pending -> running (regardless of what else is present)", () => {
    for (const other of ALL) {
      expect(combineRunStatus(["pending", other])).toBe("running");
    }
  });

  it("no pending, any failed -> partial_failure", () => {
    expect(combineRunStatus(["failed", "completed"])).toBe("partial_failure");
    expect(combineRunStatus(["completed", "failed", "skipped"])).toBe(
      "partial_failure",
    );
  });

  it("no pending/failed, any empty_extraction -> partial_failure", () => {
    expect(combineRunStatus(["empty_extraction", "completed"])).toBe(
      "partial_failure",
    );
  });

  it("only completed (and skipped) -> completed", () => {
    expect(combineRunStatus(["completed"])).toBe("completed");
    expect(combineRunStatus(["completed", "skipped"])).toBe("completed");
    expect(combineRunStatus(["skipped", "completed", "completed"])).toBe(
      "completed",
    );
  });

  it("all skipped -> partial_failure (a stopped run is not a clean success)", () => {
    expect(combineRunStatus(["skipped"])).toBe("partial_failure");
    expect(combineRunStatus(["skipped", "skipped"])).toBe("partial_failure");
  });

  it("is order-independent", () => {
    const input: Outcome[] = ["completed", "empty_extraction", "skipped"];
    expect(combineRunStatus(input)).toBe(
      combineRunStatus([...input].reverse()),
    );
  });

  it("defensively returns running for an empty input", () => {
    expect(combineRunStatus([])).toBe("running");
  });
});
