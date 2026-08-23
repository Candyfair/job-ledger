import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renders the boilerplate page content", () => {
    render(<Home />);
    expect(screen.getByText("page.tsx")).toBeInTheDocument();
  });
});
