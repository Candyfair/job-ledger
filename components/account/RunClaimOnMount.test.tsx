import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { RunClaimOnMount } from "./RunClaimOnMount";

const { replace, searchParamsValue } = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParamsValue: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/dashboard",
  useSearchParams: () => searchParamsValue.current,
}));

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsValue.current = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
  );
});

describe("RunClaimOnMount", () => {
  it("does nothing when there is no claimRunId", async () => {
    render(<RunClaimOnMount />);

    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });

  it("posts the claim, awaits it, then strips claimRunId and selects the claimed run", async () => {
    searchParamsValue.current = new URLSearchParams({
      claimRunId: "run-42",
      other: "kept",
    });

    render(<RunClaimOnMount />);

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/scrape/claim",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ runId: "run-42" }),
        }),
      ),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/dashboard?other=kept&runId=run-42",
      ),
    );
  });

  it("strips claimRunId without selecting a run when the claim fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    searchParamsValue.current = new URLSearchParams({ claimRunId: "run-42" });

    render(<RunClaimOnMount />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
});
