import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DashboardClient } from "./DashboardClient";
import type { ListingDTO } from "@/lib/dashboard/listing-query";
import type { RunHistoryEntry } from "@/lib/dashboard/run-history";
import type { RunStatusPayload } from "@/lib/dashboard/assemble-run-status";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function makeListing(overrides: Partial<ListingDTO>): ListingDTO {
  return {
    id: "id",
    scrapeRunId: "run-1",
    site: "apec",
    title: "Kept Job",
    company: "Kept Co",
    companyNormalized: null,
    roleCanonical: null,
    datePosted: "2026-08-21",
    salaryRaw: "50k",
    url: "https://example.com/kept",
    excludedByKeyword: null,
    duplicateOfListingId: null,
    createdAt: "2026-08-21T09:00:00.000Z",
    ...overrides,
  };
}

const keptListing = makeListing({ id: "kept-1" });
const excludedListing = makeListing({
  id: "excluded-1",
  title: "Excluded Job",
  company: "Excluded Co",
  excludedByKeyword: ["PHP"],
});

function renderDashboard() {
  return render(
    <DashboardClient
      mode="authenticated"
      initialRuns={[]}
      initialRunsCursor={null}
      selectedRunId={null}
      initialListings={[keptListing, excludedListing]}
      initialListingsCursor={null}
    />,
  );
}

describe("DashboardClient — global exclusion mode composition", () => {
  it("Folded (default): shows the excluded listing collapsed with a reveal control", () => {
    renderDashboard();

    expect(screen.getAllByText(/Excluded Job/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("▸ révéler").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 exclues/)).toBeInTheDocument();
  });

  it("Revealed: shows the excluded listing expanded with no reveal control", () => {
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Révélé" }));

    expect(screen.getAllByText(/Excluded Job/).length).toBeGreaterThan(0);
    expect(screen.queryByText("▸ révéler")).not.toBeInTheDocument();
  });

  it("Hidden: removes the excluded listing entirely and zeroes the excluded count", () => {
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Masqué" }));

    expect(screen.queryByText(/Excluded Job/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Kept Job/).length).toBeGreaterThan(0);
    expect(screen.getByText(/0 exclues/)).toBeInTheDocument();
  });
});

describe("DashboardClient — run-scoped listing view", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ listings: [], nextCursor: null }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function renderForRun(runId: string | null, listings: ListingDTO[]) {
    return render(
      <DashboardClient
        mode="authenticated"
        initialRuns={[]}
        initialRunsCursor={null}
        selectedRunId={runId}
        initialListings={listings}
        initialListingsCursor="cursor-1"
      />,
    );
  }

  it("remounting for another run replaces the table and the counter", () => {
    const runAListing = makeListing({
      id: "a-1",
      title: "Run A Job",
      scrapeRunId: "run-a",
    });
    const runBListing = makeListing({
      id: "b-1",
      title: "Run B Job",
      scrapeRunId: "run-b",
    });

    renderForRun("run-a", [runAListing]);
    expect(screen.getAllByText(/Run A Job/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 annonces/)).toBeInTheDocument();

    // `app/page.tsx` keys <DashboardClient> by the selected run, so switching
    // runs unmounts the old instance and mounts a fresh one seeded from the
    // new run's SSR-fetched listings.
    cleanup();
    renderForRun("run-b", [runBListing, makeListing({ id: "b-2" })]);

    expect(screen.queryByText(/Run A Job/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Run B Job/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 annonces/)).toBeInTheDocument();
  });

  it("'Charger plus' scopes the fetch to the selected run", async () => {
    renderForRun("run-a", [makeListing({ id: "a-1" })]);

    fireEvent.click(screen.getByRole("button", { name: "Charger plus" }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const url = new URL(
      vi.mocked(global.fetch).mock.calls[0][0] as string,
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/listings");
    expect(url.searchParams.get("runId")).toBe("run-a");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
  });

  it("'Charger plus' for the all-time view sends no runId", async () => {
    renderForRun(null, [makeListing({ id: "a-1" })]);

    fireEvent.click(screen.getByRole("button", { name: "Charger plus" }));

    const url = new URL(
      vi.mocked(global.fetch).mock.calls[0][0] as string,
      "http://localhost",
    );
    expect(url.searchParams.has("runId")).toBe(false);
  });

  it("counts rendered rows, not folded duplicates, as 'annonces'", () => {
    const primary = makeListing({ id: "p-1", title: "Primary Job" });
    const duplicate = makeListing({
      id: "d-1",
      title: "Duplicate Job",
      duplicateOfListingId: "p-1",
    });

    renderForRun("run-a", [primary, duplicate]);

    // Two listings, one group, one visible row.
    expect(screen.getByText(/1 annonces/)).toBeInTheDocument();
    expect(screen.getByText(/1 groupes de doublons/)).toBeInTheDocument();
  });
});

describe("DashboardClient — status banner (authenticated, SPEC.md §3 2026-09-07)", () => {
  function makeRun(overrides: Partial<RunHistoryEntry>): RunHistoryEntry {
    return {
      runId: "run-x",
      status: "completed",
      triggeredAt: "2026-09-10T09:00:00.000Z",
      model: "claude_haiku",
      sitesIncluded: ["apec"],
      sites: [],
      kept: 0,
      excluded: 0,
      duplicateGroups: 0,
      ...overrides,
    };
  }

  it("falls back to the latest run when nothing is selected and it's running — e.g. a visitor on bare /dashboard while one of their own runs is still in flight", () => {
    const latest = makeRun({ runId: "run-latest", status: "running" });

    render(
      <DashboardClient
        mode="authenticated"
        initialRuns={[latest]}
        initialRunsCursor={null}
        selectedRunId={null}
        initialListings={[]}
        initialListingsCursor={null}
      />,
    );

    expect(screen.getByText("Recherche en cours…")).toBeInTheDocument();
  });

  it("shows no banner for a resolved historical run picked from the strip that was never observed running", () => {
    const historical = makeRun({ runId: "run-old", status: "completed" });

    render(
      <DashboardClient
        mode="authenticated"
        initialRuns={[historical]}
        initialRunsCursor={null}
        selectedRunId="run-old"
        initialListings={[]}
        initialListingsCursor={null}
      />,
    );

    expect(screen.queryByText(/Terminé/)).not.toBeInTheDocument();
    expect(screen.queryByText("Recherche en cours…")).not.toBeInTheDocument();
  });
});

describe("DashboardClient — anonymous run claim prompt (SPEC.md §3 2026-09-07)", () => {
  function makeStatus(overrides: Partial<RunStatusPayload>): RunStatusPayload {
    return {
      runId: "run-anon",
      status: "running",
      triggeredAt: "2026-09-11T09:00:00.000Z",
      model: "claude_haiku",
      sitesIncluded: ["apec"],
      sites: [],
      kept: 0,
      excluded: 0,
      duplicateGroups: 0,
      ...overrides,
    };
  }

  it("shows no claim prompt while the run is still running", () => {
    render(
      <DashboardClient
        mode="anonymous-run"
        initialStatus={makeStatus({ status: "running" })}
        initialListings={[]}
        initialListingsCursor={null}
      />,
    );

    expect(
      screen.queryByText("Créez un compte pour sauvegarder cette recherche."),
    ).not.toBeInTheDocument();
  });

  it("shows the claim prompt, linking to sign-up with the runId, once the run has resolved", () => {
    render(
      <DashboardClient
        mode="anonymous-run"
        initialStatus={makeStatus({ status: "completed", kept: 2 })}
        initialListings={[]}
        initialListingsCursor={null}
      />,
    );

    expect(
      screen.getByText("Créez un compte pour sauvegarder cette recherche."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Créer un compte →" }),
    ).toHaveAttribute("href", "/sign-up?runId=run-anon");
  });

  it("never shows the claim prompt in authenticated mode", () => {
    render(
      <DashboardClient
        mode="authenticated"
        initialRuns={[]}
        initialRunsCursor={null}
        selectedRunId={null}
        initialListings={[]}
        initialListingsCursor={null}
      />,
    );

    expect(
      screen.queryByText("Créez un compte pour sauvegarder cette recherche."),
    ).not.toBeInTheDocument();
  });
});

describe("DashboardClient — toolbar counts align with the run status (2026-09-11)", () => {
  function makeRun(overrides: Partial<RunHistoryEntry>): RunHistoryEntry {
    return {
      runId: "run-x",
      status: "completed",
      triggeredAt: "2026-09-10T09:00:00.000Z",
      model: "claude_haiku",
      sitesIncluded: ["apec"],
      sites: [],
      kept: 0,
      excluded: 0,
      duplicateGroups: 0,
      ...overrides,
    };
  }

  it("uses the run status's kept/excluded/duplicateGroups instead of only what's been paginated in, for a single run in view", () => {
    render(
      <DashboardClient
        mode="authenticated"
        initialRuns={[makeRun({ kept: 100, excluded: 3, duplicateGroups: 2 })]}
        initialRunsCursor={null}
        selectedRunId="run-x"
        // Only one listing loaded so far (the SSR page is 50 at a time) —
        // the toolbar should still reflect the run's real totals (kept +
        // excluded in the default "folded" mode, which shows both), not
        // "1 annonces".
        initialListings={[keptListing]}
        initialListingsCursor="cursor-1"
      />,
    );

    // A single combined match — the run-history strip below also renders
    // its own "N exclues" per entry, so a bare /3 exclues/ query would match
    // both.
    expect(
      screen.getByText(/103 annonces · 3 exclues · 2 groupes de doublons/),
    ).toBeInTheDocument();
  });

  it("falls back to the listings-derived counts for the all-time aggregate, which has no single authoritative total", () => {
    render(
      <DashboardClient
        mode="authenticated"
        initialRuns={[makeRun({ kept: 100 })]}
        initialRunsCursor={null}
        selectedRunId={null}
        initialListings={[keptListing]}
        initialListingsCursor={null}
      />,
    );

    expect(screen.getByText(/1 annonces/)).toBeInTheDocument();
  });
});
