import { describe, it, expect } from "vitest";
import { siteIssueMessage, bannerCompletionLine } from "./banner-copy";
import type { RunStatusPayload, SiteRunStatus } from "./assemble-run-status";

function makeSite(overrides: Partial<SiteRunStatus> = {}): SiteRunStatus {
  return {
    site: "hellowork",
    label: "HelloWork",
    code: "HW",
    status: "completed",
    failureCause: null,
    listingCount: 0,
    ...overrides,
  };
}

function makeStatus(
  overrides: Partial<RunStatusPayload> = {},
): RunStatusPayload {
  return {
    runId: "run-1",
    status: "completed",
    triggeredAt: "2026-09-10T09:00:00.000Z",
    model: "claude_haiku",
    sitesIncluded: ["hellowork"],
    sites: [],
    kept: 0,
    excluded: 0,
    duplicateGroups: 0,
    ...overrides,
  };
}

describe("siteIssueMessage", () => {
  it("reuses the SPEC.md §5 bot_challenge sentence verbatim", () => {
    expect(
      siteIssueMessage(
        makeSite({ status: "failed", failureCause: "bot_challenge" }),
      ),
    ).toBe(
      "Accès à HelloWork bloqué (protection anti-bot) — le site nécessite une vérification manuelle.",
    );
  });

  it("reuses the SPEC.md §5 markup_broken sentence verbatim", () => {
    expect(
      siteIssueMessage(
        makeSite({ status: "failed", failureCause: "markup_broken" }),
      ),
    ).toBe(
      "Impossible de récupérer les résultats de HelloWork — le site a peut-être changé et doit être vérifié.",
    );
  });

  it("has its own copy for a timeout failure (no §5 text exists for it)", () => {
    expect(
      siteIssueMessage(makeSite({ status: "failed", failureCause: "timeout" })),
    ).toContain("HelloWork");
  });

  it("has its own copy for empty_extraction", () => {
    expect(
      siteIssueMessage(makeSite({ status: "empty_extraction" })),
    ).toContain("HelloWork");
  });

  it("has its own copy for skipped", () => {
    expect(siteIssueMessage(makeSite({ status: "skipped" }))).toContain(
      "HelloWork",
    );
  });

  it("returns null for a site with nothing to report", () => {
    expect(siteIssueMessage(makeSite({ status: "completed" }))).toBeNull();
    expect(siteIssueMessage(makeSite({ status: "pending" }))).toBeNull();
  });
});

describe("bannerCompletionLine", () => {
  it("gives a short confirmation for a completed run", () => {
    expect(
      bannerCompletionLine(makeStatus({ status: "completed", kept: 1 })),
    ).toBe("Terminé — 1 annonce conservée.");
    expect(
      bannerCompletionLine(makeStatus({ status: "completed", kept: 5 })),
    ).toBe("Terminé — 5 annonces conservées.");
  });

  it("concatenates every failing site's message, prefixed once", () => {
    const line = bannerCompletionLine(
      makeStatus({
        status: "partial_failure",
        sites: [
          makeSite({
            site: "apec",
            label: "Apec.fr",
            status: "failed",
            failureCause: "bot_challenge",
          }),
          makeSite({
            site: "hellowork",
            label: "HelloWork",
            status: "completed",
          }),
        ],
      }),
    );

    expect(line).toBe(
      "Terminé — Accès à Apec.fr bloqué (protection anti-bot) — le site nécessite une vérification manuelle.",
    );
  });

  it("joins multiple site issues in one line", () => {
    const line = bannerCompletionLine(
      makeStatus({
        status: "partial_failure",
        sites: [
          makeSite({
            site: "apec",
            label: "Apec.fr",
            status: "empty_extraction",
          }),
          makeSite({
            site: "hellowork",
            label: "HelloWork",
            status: "skipped",
          }),
        ],
      }),
    );

    expect(line).toContain("Apec.fr");
    expect(line).toContain("HelloWork");
    expect(line.startsWith("Terminé — ")).toBe(true);
  });
});
