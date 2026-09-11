import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountHeader } from "./AccountHeader";

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const { signOut } = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth-client", () => ({ signOut }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AccountHeader — authenticated", () => {
  it("shows the email, the linked providers, and signs out", async () => {
    render(
      <AccountHeader
        variant="authenticated"
        email="dev@example.com"
        image="https://avatars.example/u.png"
        providers={["github", "google"]}
      />,
    );

    expect(screen.getByText("dev@example.com")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("falls back to an initial when there is no avatar image", () => {
    render(
      <AccountHeader
        variant="authenticated"
        email="candice@example.com"
        image={null}
        providers={["google"]}
      />,
    );

    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("AccountHeader — anonymous", () => {
  it("links to sign-in with no runId when there is none", () => {
    render(<AccountHeader variant="anonymous" />);

    const link = screen.getByRole("link", {
      name: "Se connecter / Créer un compte",
    });
    expect(link).toHaveAttribute("href", "/sign-in");
  });

  it("forwards the runId onto the sign-in link", () => {
    render(<AccountHeader variant="anonymous" runId="run-42" />);

    expect(
      screen.getByRole("link", { name: "Se connecter / Créer un compte" }),
    ).toHaveAttribute("href", "/sign-in?runId=run-42");
  });
});
