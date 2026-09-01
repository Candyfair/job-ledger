import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl, type SegmentOption } from "./SegmentedControl";

const options: SegmentOption<"a" | "b" | "c">[] = [
  { key: "a", label: "Option A" },
  { key: "b", label: "Option B" },
  { key: "c", label: "Option C" },
];

describe("SegmentedControl — three-way exclusive selection", () => {
  it("marks only the active option as pressed", () => {
    render(<SegmentedControl options={options} value="b" onChange={vi.fn()} />);

    expect(screen.getByText("Option A")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText("Option B")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Option C")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onChange with the clicked option's key", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl options={options} value="a" onChange={onChange} />,
    );

    fireEvent.click(screen.getByText("Option C"));

    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("still reports the click even when the already-active option is clicked", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl options={options} value="a" onChange={onChange} />,
    );

    fireEvent.click(screen.getByText("Option A"));

    expect(onChange).toHaveBeenCalledWith("a");
  });
});
