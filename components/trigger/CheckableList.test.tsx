import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckableList } from "./CheckableList";

const items = [
  { id: "a", label: "Site A" },
  { id: "b", label: "Site B" },
];

describe("CheckableList — hybrid pre-checked/uncheckable selection", () => {
  it("renders every item pre-checked when all ids are selected", () => {
    render(
      <CheckableList
        items={items}
        selectedIds={["a", "b"]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Site A")).toBeChecked();
    expect(screen.getByLabelText("Site B")).toBeChecked();
  });

  it("unchecking an item excludes it from the emitted selection", () => {
    const onChange = vi.fn();
    render(
      <CheckableList
        items={items}
        selectedIds={["a", "b"]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Site A"));

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("re-checking a previously unchecked item restores it", () => {
    const onChange = vi.fn();
    render(
      <CheckableList items={items} selectedIds={["b"]} onChange={onChange} />,
    );

    expect(screen.getByLabelText("Site A")).not.toBeChecked();

    fireEvent.click(screen.getByLabelText("Site A"));

    expect(onChange).toHaveBeenCalledWith(["b", "a"]);
  });
});
