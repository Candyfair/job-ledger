import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusBanner } from "./StatusBanner";
import type { RunStatusPayload } from "@/lib/dashboard/assemble-run-status";

function makeStatus(
  overrides: Partial<RunStatusPayload> = {},
): RunStatusPayload {
  return {
    runId: "run-1",
    status: "running",
    triggeredAt: "2026-09-10T09:00:00.000Z",
    model: "claude_haiku",
    sitesIncluded: ["apec", "hellowork"],
    sites: [],
    kept: 0,
    excluded: 0,
    duplicateGroups: 0,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("StatusBanner", () => {
  it("shows the running line and pedagogical copy, expanded by default", () => {
    render(<StatusBanner status={makeStatus({ status: "running" })} />);

    expect(screen.getByText("Recherche en cours…")).toBeInTheDocument();
    expect(screen.getByText(/politique de politesse/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réduire" })).toBeInTheDocument();
  });

  it("shows a short completion line once completed", () => {
    render(
      <StatusBanner status={makeStatus({ status: "completed", kept: 3 })} />,
    );

    expect(
      screen.getByText("Terminé — 3 annonces conservées."),
    ).toBeInTheDocument();
  });

  it("reuses the SPEC.md §5 sentence verbatim for a partial_failure bot-challenge site", () => {
    render(
      <StatusBanner
        status={makeStatus({
          status: "partial_failure",
          sites: [
            {
              site: "hellowork",
              label: "HelloWork",
              code: "HW",
              status: "failed",
              failureCause: "bot_challenge",
              listingCount: 0,
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText(
        "Terminé — Accès à HelloWork bloqué (protection anti-bot) — le site nécessite une vérification manuelle.",
      ),
    ).toBeInTheDocument();
  });

  it("collapses to a single line and persists the choice to localStorage", () => {
    render(<StatusBanner status={makeStatus({ status: "running" })} />);

    fireEvent.click(screen.getByRole("button", { name: "Réduire" }));

    expect(
      screen.queryByText(/politique de politesse/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Recherche en cours…/ }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("bannerCollapsed")).toBe("true");
  });

  it("starts collapsed when localStorage already says so, and its line still tracks status", () => {
    window.localStorage.setItem("bannerCollapsed", "true");

    render(
      <StatusBanner status={makeStatus({ status: "completed", kept: 2 })} />,
    );

    expect(
      screen.queryByText(/politique de politesse/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Déplier")).toBeInTheDocument();
    expect(
      screen.getByText("Terminé — 2 annonces conservées."),
    ).toBeInTheDocument();
  });
});
