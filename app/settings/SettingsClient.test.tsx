import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsClient } from "./SettingsClient";

const initialJobConfigs = [
  {
    id: "jc-1",
    title: "Backend / Python & Go",
    excludedKeywords: ["Python", "Go"],
    location: "Anywhere",
  },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("SettingsClient", () => {
  it("renders the initial job configs with their excluded-keyword chips", () => {
    render(<SettingsClient initialJobConfigs={initialJobConfigs} />);

    expect(screen.getByText("Backend / Python & Go")).toBeInTheDocument();
    expect(screen.getByText("Excludes:")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("Go")).toBeInTheDocument();
  });

  it("adds a job config", async () => {
    const created = {
      id: "jc-2",
      title: "Frontend",
      excludedKeywords: ["React"],
      location: null,
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(created, 201));

    render(<SettingsClient initialJobConfigs={initialJobConfigs} />);

    fireEvent.click(screen.getByText("+ Add a job config"));
    fireEvent.change(screen.getByLabelText("JOB TITLE"), {
      target: { value: "Frontend" },
    });
    fireEvent.change(screen.getByLabelText("EXCLUDED KEYWORDS"), {
      target: { value: "React" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Frontend")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/job-configs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("edits a job config", async () => {
    const updated = { ...initialJobConfigs[0], title: "Backend / Go only" };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(updated));

    render(<SettingsClient initialJobConfigs={initialJobConfigs} />);

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("JOB TITLE"), {
      target: { value: "Backend / Go only" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Backend / Go only")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/job-configs/jc-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("deletes a job config", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
    } as Response);

    render(<SettingsClient initialJobConfigs={initialJobConfigs} />);

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(
        screen.queryByText("Backend / Python & Go"),
      ).not.toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/job-configs/jc-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
