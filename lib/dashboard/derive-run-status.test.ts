import { describe, it, expect } from "vitest";
import { deriveRunStatus } from "./derive-run-status";
import type { Site } from "@/lib/sites";

const baseRun = {
  id: "run-1",
  triggeredAt: new Date("2026-08-21T09:00:00.000Z"),
  modelUsed: "claude_haiku" as const,
  sitesIncluded: ["apec", "hellowork"] as Site[],
};

describe("deriveRunStatus — kept/excluded/duplicate counts", () => {
  it("counts kept vs excluded from excludedByKeyword", () => {
    const result = deriveRunStatus({
      run: baseRun,
      listings: [
        { site: "apec", excludedByKeyword: null, duplicateOfListingId: null },
        { site: "apec", excludedByKeyword: [], duplicateOfListingId: null },
        {
          site: "hellowork",
          excludedByKeyword: ["PHP"],
          duplicateOfListingId: null,
        },
      ],
      siteStatuses: [],
    });

    expect(result.kept).toBe(2);
    expect(result.excluded).toBe(1);
  });

  it("counts distinct duplicate groups by their primary id", () => {
    const result = deriveRunStatus({
      run: baseRun,
      listings: [
        { site: "apec", excludedByKeyword: null, duplicateOfListingId: null },
        {
          site: "apec",
          excludedByKeyword: null,
          duplicateOfListingId: "primary-1",
        },
        {
          site: "hellowork",
          excludedByKeyword: null,
          duplicateOfListingId: "primary-1",
        },
        {
          site: "hellowork",
          excludedByKeyword: null,
          duplicateOfListingId: "primary-2",
        },
      ],
      siteStatuses: [],
    });

    expect(result.duplicateGroups).toBe(2);
  });
});

describe("deriveRunStatus — overall status derivation", () => {
  it("is running while a site has no listings and no failure signal", () => {
    const result = deriveRunStatus({
      run: baseRun,
      listings: [
        { site: "apec", excludedByKeyword: null, duplicateOfListingId: null },
      ],
      siteStatuses: [],
      now: new Date("2026-08-21T09:02:00.000Z"),
    });

    expect(result.sites.find((s) => s.site === "hellowork")?.status).toBe(
      "pending",
    );
    expect(result.status).toBe("running");
  });

  it("is completed once every site has produced at least one listing", () => {
    const result = deriveRunStatus({
      run: baseRun,
      listings: [
        { site: "apec", excludedByKeyword: null, duplicateOfListingId: null },
        {
          site: "hellowork",
          excludedByKeyword: null,
          duplicateOfListingId: null,
        },
      ],
      siteStatuses: [],
      now: new Date("2026-08-21T09:02:00.000Z"),
    });

    expect(result.status).toBe("completed");
  });

  it("is partial_failure when a site's SiteStatus failed after the run started", () => {
    const result = deriveRunStatus({
      run: baseRun,
      listings: [
        {
          site: "hellowork",
          excludedByKeyword: null,
          duplicateOfListingId: null,
        },
      ],
      siteStatuses: [
        {
          site: "apec",
          active: false,
          lastErrorAt: new Date("2026-08-21T09:01:00.000Z"),
          lastFailureCause: "markup_broken",
        },
      ],
      now: new Date("2026-08-21T09:02:00.000Z"),
    });

    const apecStatus = result.sites.find((s) => s.site === "apec");
    expect(apecStatus?.status).toBe("failed");
    expect(apecStatus?.failureCause).toBe("markup_broken");
    expect(result.status).toBe("partial_failure");
  });

  it("does not attribute a SiteStatus failure recorded before the run started", () => {
    const result = deriveRunStatus({
      run: baseRun,
      listings: [
        { site: "apec", excludedByKeyword: null, duplicateOfListingId: null },
        {
          site: "hellowork",
          excludedByKeyword: null,
          duplicateOfListingId: null,
        },
      ],
      siteStatuses: [
        {
          site: "apec",
          active: false,
          // Before baseRun.triggeredAt (09:00) — a stale failure from an
          // earlier run, not this one.
          lastErrorAt: new Date("2026-08-21T08:00:00.000Z"),
          lastFailureCause: "bot_challenge",
        },
      ],
      now: new Date("2026-08-21T09:02:00.000Z"),
    });

    const apecStatus = result.sites.find((s) => s.site === "apec");
    expect(apecStatus?.status).toBe("completed");
    expect(result.status).toBe("completed");
  });

  it("resolves to completed after the stale timeout even with a still-pending site", () => {
    const result = deriveRunStatus({
      run: baseRun,
      listings: [
        { site: "apec", excludedByKeyword: null, duplicateOfListingId: null },
      ],
      siteStatuses: [],
      // 11 minutes after triggeredAt — past the 10-minute stale timeout.
      now: new Date("2026-08-21T09:11:00.000Z"),
    });

    expect(result.status).toBe("completed");
  });
});
