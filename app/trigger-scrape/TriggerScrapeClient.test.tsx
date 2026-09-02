import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TriggerScrapeClient } from "./TriggerScrapeClient";

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
  return screen.getByRole("button", { name: "Trigger scrape" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("TriggerScrapeClient — authenticated", () => {
  it("renders the job-configs checklist, pre-checked, and posts jobConfigIds on submit", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ runId: "run-1" }));

    render(
      <TriggerScrapeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    expect(screen.getByText("Job configs")).toBeInTheDocument();
    expect(screen.queryByText("This search")).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("run-1");
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.jobConfigIds).toEqual(["jc-1", "jc-2"]);
    expect(body.sites).toEqual(["apec", "hellowork"]);
    expect(body.adHocSearch).toBeUndefined();
  });

  it("disables submit once every job config is unchecked", () => {
    render(
      <TriggerScrapeClient
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
      <TriggerScrapeClient
        isAuthenticated={true}
        initialJobConfigs={initialJobConfigs}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Apec\.fr/));
    fireEvent.click(screen.getByLabelText(/HelloWork/));

    expect(submitButton()).toBeDisabled();
  });
});

describe("TriggerScrapeClient — anonymous", () => {
  it("renders the ad-hoc search fields instead of job configs, enabled once the title alone is filled", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ runId: "run-2" }));

    render(
      <TriggerScrapeClient isAuthenticated={false} initialJobConfigs={[]} />,
    );

    expect(screen.getByText("This search")).toBeInTheDocument();
    expect(screen.queryByText("Job configs")).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("JOB TITLE"), {
      target: { value: "Senior Frontend Engineer" },
    });
    // Title alone is enough — excluded keywords are optional.
    expect(submitButton()).toBeEnabled();

    fireEvent.change(screen.getByLabelText("EXCLUDED KEYWORDS"), {
      target: { value: "fullstack, lead" },
    });

    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("run-2");
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.adHocSearch).toEqual({
      title: "Senior Frontend Engineer",
      excludedKeywords: ["fullstack", "lead"],
      location: undefined,
    });
    expect(body.jobConfigIds).toBeUndefined();
  });

  it("shows the API's error message on a failed submit", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: "Too many scrape requests from this IP — try again later" },
        429,
      ),
    );

    render(
      <TriggerScrapeClient isAuthenticated={false} initialJobConfigs={[]} />,
    );

    fireEvent.change(screen.getByLabelText("JOB TITLE"), {
      target: { value: "Dev" },
    });
    fireEvent.click(submitButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many scrape requests from this IP — try again later",
      );
    });
  });
});
