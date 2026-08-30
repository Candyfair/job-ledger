"use client";

export type CheckableItem = {
  id: string;
  label: string;
  badge?: string;
  subtitle?: string;
};

/**
 * The "hybrid pre-checked/uncheckable" list (SPEC.md §3): every item starts
 * checked (the parent seeds `selectedIds` with every item's id) and each is
 * individually uncheckable. Shared between the trigger form's Job configs
 * and Sites sections rather than duplicated, since both use the exact same
 * pattern.
 */
export function CheckableList({
  items,
  selectedIds,
  onChange,
}: {
  items: CheckableItem[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selected) => selected !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 border-y border-zinc-200">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 py-3">
          <input
            type="checkbox"
            id={`checkable-${item.id}`}
            checked={selectedIds.includes(item.id)}
            onChange={() => toggle(item.id)}
            className="mt-0.5 h-4 w-4"
          />
          <label
            htmlFor={`checkable-${item.id}`}
            className="flex flex-1 flex-col gap-0.5"
          >
            <span className="flex items-center gap-2">
              {item.badge && (
                <span className="rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
                  {item.badge}
                </span>
              )}
              <span className="text-sm text-zinc-900">{item.label}</span>
            </span>
            {item.subtitle && (
              <span className="text-sm text-zinc-600">{item.subtitle}</span>
            )}
          </label>
        </li>
      ))}
    </ul>
  );
}
