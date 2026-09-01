"use client";

import { useState } from "react";

/**
 * Wraps a single excluded listing's "folded" display: starts collapsed, a
 * "▸ révéler" control expands it to whatever `children(true)` renders. Only
 * meaningful in "folded" mode — in "revealed" mode every excluded listing is
 * already shown expanded, so callers render `children(true)` directly
 * instead of using this wrapper at all (SPEC.md §3's per-listing reveal
 * semantics: the control disappears once the global toggle is Revealed).
 *
 * `children(false)` still renders real content (the struck-through
 * title/company/matched-keyword summary) — "revealed" only adds the row's
 * remaining detail (posted date, site badge, salary, open link), it doesn't
 * establish exclusion, which is already visible collapsed.
 */
export function ExclusionRevealRow({
  children,
}: {
  children: (revealed: boolean) => React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-expanded={revealed}
        className="w-fit text-left text-[11px] font-medium tracking-wide text-zinc-500 hover:text-zinc-800"
      >
        {revealed ? "▾ replier" : "▸ révéler"}
      </button>
      {children(revealed)}
    </div>
  );
}
