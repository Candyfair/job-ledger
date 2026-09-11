import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OAuthButtons } from "./OAuthButtons";

const { social } = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ signIn: { social } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OAuthButtons", () => {
  it("redirects to bare / with no runId", () => {
    render(<OAuthButtons />);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );

    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/" }),
    );
  });

  it("carries the runId as a claimRunId query param on /dashboard for both providers", () => {
    render(<OAuthButtons runId="run-42" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with GitHub" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(social).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        callbackURL: "/dashboard?claimRunId=run-42",
      }),
    );
    expect(social).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        callbackURL: "/dashboard?claimRunId=run-42",
      }),
    );
  });
});
