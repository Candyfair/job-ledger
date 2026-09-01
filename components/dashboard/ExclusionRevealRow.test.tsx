import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExclusionRevealRow } from "./ExclusionRevealRow";

describe("ExclusionRevealRow — per-listing exclusion reveal", () => {
  it("starts collapsed, rendering the collapsed content and the reveal control", () => {
    render(
      <ExclusionRevealRow>
        {(revealed) => (
          <span>{revealed ? "full detail" : "collapsed line"}</span>
        )}
      </ExclusionRevealRow>,
    );

    expect(screen.getByText("collapsed line")).toBeInTheDocument();
    expect(screen.queryByText("full detail")).not.toBeInTheDocument();
    expect(screen.getByText("▸ révéler")).toBeInTheDocument();
  });

  it("expands to the full content when the reveal control is clicked", () => {
    render(
      <ExclusionRevealRow>
        {(revealed) => (
          <span>{revealed ? "full detail" : "collapsed line"}</span>
        )}
      </ExclusionRevealRow>,
    );

    fireEvent.click(screen.getByText("▸ révéler"));

    expect(screen.getByText("full detail")).toBeInTheDocument();
    expect(screen.queryByText("collapsed line")).not.toBeInTheDocument();
    expect(screen.getByText("▾ replier")).toBeInTheDocument();
  });

  it("collapses again on a second click", () => {
    render(
      <ExclusionRevealRow>
        {(revealed) => (
          <span>{revealed ? "full detail" : "collapsed line"}</span>
        )}
      </ExclusionRevealRow>,
    );

    fireEvent.click(screen.getByText("▸ révéler"));
    fireEvent.click(screen.getByText("▾ replier"));

    expect(screen.getByText("collapsed line")).toBeInTheDocument();
  });
});
