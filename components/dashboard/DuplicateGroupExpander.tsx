"use client";

/**
 * "N doublons" inline expander chip (design/dashboard.jpeg). Expand state is
 * owned by the parent so multiple groups on the same page never share
 * state, and so it can be reset when the underlying listing page changes.
 */
export function DuplicateGroupExpander({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-1 w-fit rounded border border-zinc-300 px-2 py-0.5 text-[11px] font-medium tracking-wide text-zinc-600 hover:bg-zinc-50"
    >
      {expanded ? "▾" : "▸"} {count} {count === 1 ? "DOUBLON" : "DOUBLONS"}
    </button>
  );
}
