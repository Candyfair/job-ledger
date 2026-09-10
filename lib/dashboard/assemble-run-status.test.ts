import { describe, it, expect } from "vitest";
import { assembleRunStatus } from "./assemble-run-status";
import type { Site } from "@/lib/sites";

const baseRun = {
  id: "run-1",
  triggeredAt: new Date("2026-09-01T09:00:00.000Z"),
  modelUsed: "claude_haiku" as const,
  sitesIncluded: ["apec", "hellowork"] as Site[],
  status: "completed" as const,
};

const siteRow = (
  over: Partial<Parameters<typeof assembleRunStatus>[0]["siteRows"][number]>,
) => ({
  site: "apec" as Site,
  outcome: "completed" as const,
  failureCause: null,
  listingCount: 0,
  ...over,
});

describe("assembleRunStatus", () => {
  it("passes the persisted ScrapeRun.status straight through", () => {
    const result = assembleRunStatus({
      run: { ...baseRun, status: "partial_failure" },
      siteRows: [],
      listings: [],
    });
    expect(result.status).toBe("partial_failure");
  });

  it("combines a site's jobConfig rows (tier 1) and surfaces the failed row's cause", () => {
    const result = assembleRunStatus({
      run: baseRun,
      siteRows: [
        siteRow({ site: "apec", outcome: "completed", listingCount: 3 }),
        siteRow({
          site: "apec",
          outcome: "failed",
          failureCause: "bot_challenge",
        }),
        siteRow({ site: "hellowork", outcome: "completed", listingCount: 5 }),
      ],
      listings: [],
    });

    const apec = result.sites.find((s) => s.site === "apec");
    expect(apec?.status).toBe("failed");
    expect(apec?.failureCause).toBe("bot_challenge");
    // listingCount summed from ScrapeRunSite.listingCount, not the (empty)
    // Listing rows.
    expect(apec?.listingCount).toBe(3);
    expect(result.sites.find((s) => s.site === "hellowork")?.status).toBe(
      "completed",
    );
  });

  it("falls back to pending + a live Listing count for a run with no ScrapeRunSite rows", () => {
    const result = assembleRunStatus({
      run: baseRun,
      siteRows: [],
      listings: [
        { site: "apec", excludedByKeyword: [], duplicateOfListingId: null },
        { site: "apec", excludedByKeyword: [], duplicateOfListingId: null },
        {
          site: "hellowork",
          excludedByKeyword: [],
          duplicateOfListingId: null,
        },
      ],
    });

    expect(result.sites.find((s) => s.site === "apec")).toMatchObject({
      status: "pending",
      listingCount: 2,
    });
  });

  it("derives kept / excluded / duplicateGroups from the Listing rows", () => {
    const result = assembleRunStatus({
      run: baseRun,
      siteRows: [siteRow({ site: "apec", outcome: "completed" })],
      listings: [
        { site: "apec", excludedByKeyword: null, duplicateOfListingId: null },
        {
          site: "apec",
          excludedByKeyword: ["PHP"],
          duplicateOfListingId: null,
        },
        {
          site: "hellowork",
          excludedByKeyword: [],
          duplicateOfListingId: "primary-1",
        },
        {
          site: "apec",
          excludedByKeyword: [],
          duplicateOfListingId: "primary-1",
        },
      ],
    });

    expect(result.kept).toBe(3);
    expect(result.excluded).toBe(1);
    expect(result.duplicateGroups).toBe(1);
  });
});
