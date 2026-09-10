import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HomeClient } from "./HomeClient";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const initialJobConfigs = [
  {
    id: "jc-1",
    title: "Senior Frontend",
    excludedKeywords: ["React"],
    location: "Paris",
  },
  { id: "jc-2", title: "Backend", excludedKeywords: ["Go"], location: null },
];

function jsonResponse(body: unknown, status = 201) {
  return { ok: status < 300, status, json: async () => body } as Response;
}

function submitButton() {
  return screen.getByRole("button", { name: "Lancer le scraping" });
}

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal("fetch", vi.fn());
});

describe("HomeClient — authenticated trigger", () => {
  it("renders the saved-searches checklist pre-checked and posts jobConfigIds, then redirects to /dashboard", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ runId: "run-1" }));

    render(
      <HomeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    expect(screen.getByText("Mes recherches")).toBeInTheDocument();
    expect(screen.queryByText("Cette recherche")).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard");
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.jobConfigIds).toEqual(["jc-1", "jc-2"]);
    expect(body.sites).toEqual(["apec", "hellowork"]);
    expect(body.adHocSearch).toBeUndefined();
  });

  it("disables submit once every saved search is unchecked", () => {
    render(
      <HomeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Senior Frontend/));
    fireEvent.click(screen.getByLabelText(/^Backend/));

    expect(submitButton()).toBeDisabled();
  });

  it("disables submit once every site is unchecked", () => {
    render(
      <HomeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Apec\.fr/));
    fireEvent.click(screen.getByLabelText(/HelloWork/));

    expect(submitButton()).toBeDisabled();
  });
});

describe("HomeClient — authenticated saved-search CRUD", () => {
  it("adds a saved search, pre-checked", async () => {
    const created = {
      id: "jc-3",
      title: "Frontend",
      excludedKeywords: ["React"],
      location: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(created, 201));

    render(
      <HomeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    fireEvent.click(screen.getByText("Ajouter une nouvelle recherche"));
    fireEvent.change(screen.getByLabelText("INTITULÉ DU POSTE"), {
      target: { value: "Frontend" },
    });
    fireEvent.change(screen.getByLabelText("MOTS-CLÉS À EXCLURE"), {
      target: { value: "React" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(screen.getByText("Frontend")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/job-configs",
      expect.objectContaining({ method: "POST" }),
    );
    // Counter reflects the new search being selected (3, not 2).
    expect(screen.getByText(/3 recherches/)).toBeInTheDocument();
  });

  it("edits a saved search", async () => {
    const updated = { ...initialJobConfigs[0], title: "Senior Frontend FR" };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(updated, 200));

    render(
      <HomeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    fireEvent.click(screen.getAllByText("Modifier")[0]);
    fireEvent.change(screen.getByLabelText("INTITULÉ DU POSTE"), {
      target: { value: "Senior Frontend FR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(screen.getByText("Senior Frontend FR")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/job-configs/jc-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("deletes a saved search and drops it from the selection", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
    } as Response);

    render(
      <HomeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    fireEvent.click(screen.getAllByText("Supprimer")[0]);

    await waitFor(() => {
      expect(screen.queryByText("Senior Frontend")).not.toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/job-configs/jc-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.getByText(/1 recherches/)).toBeInTheDocument();
  });
});

describe("HomeClient — anonymous trigger", () => {
  it("renders the ad hoc search fields, enabled once the title alone is filled, and redirects with the runId", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ runId: "run-2" }));

    render(<HomeClient isAuthenticated={false} initialJobConfigs={[]} />);

    expect(screen.getByText("Cette recherche")).toBeInTheDocument();
    expect(screen.queryByText("Mes recherches")).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("INTITULÉ DU POSTE"), {
      target: { value: "Développeur Frontend Senior" },
    });
    expect(submitButton()).toBeEnabled();

    fireEvent.change(screen.getByLabelText("MOTS-CLÉS À EXCLURE"), {
      target: { value: "fullstack, lead" },
    });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard?runId=run-2");
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.adHocSearch).toEqual({
      title: "Développeur Frontend Senior",
      excludedKeywords: ["fullstack", "lead"],
      location: undefined,
    });
    expect(body.jobConfigIds).toBeUndefined();
  });

  it("shows the API's error message on a failed submit and does not redirect", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: "Too many scrape requests from this IP — try again later" },
        429,
      ),
    );

    render(<HomeClient isAuthenticated={false} initialJobConfigs={[]} />);

    fireEvent.change(screen.getByLabelText("INTITULÉ DU POSTE"), {
      target: { value: "Dev" },
    });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many scrape requests from this IP — try again later",
      );
    });
    expect(push).not.toHaveBeenCalled();
  });
});
