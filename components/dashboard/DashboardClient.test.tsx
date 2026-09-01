import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardClient } from "./DashboardClient";
import type { ListingDTO } from "@/lib/dashboard/listing-query";

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
