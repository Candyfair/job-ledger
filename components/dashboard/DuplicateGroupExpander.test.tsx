import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DuplicateGroupExpander } from "./DuplicateGroupExpander";

describe("DuplicateGroupExpander — inline duplicate group expand", () => {
  it("shows the correct singular/plural count label", () => {
    const { rerender } = render(
      <DuplicateGroupExpander count={1} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByText(/1 DOUBLON$/)).toBeInTheDocument();

    rerender(
      <DuplicateGroupExpander count={3} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByText(/3 DOUBLONS$/)).toBeInTheDocument();
  });

  it("reflects the collapsed/expanded state via aria-expanded", () => {
    const { rerender } = render(
      <DuplicateGroupExpander count={2} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    rerender(
      <DuplicateGroupExpander count={2} expanded={true} onToggle={vi.fn()} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(
      <DuplicateGroupExpander count={2} expanded={false} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps two groups' expand state independent", () => {
    function TwoGroups() {
      return (
        <>
          <DuplicateGroupExpander
            count={2}
            expanded={false}
            onToggle={() => {}}
          />
          <DuplicateGroupExpander
            count={5}
            expanded={true}
            onToggle={() => {}}
          />
        </>
      );
    }
    render(<TwoGroups />);

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "true");
  });
});
