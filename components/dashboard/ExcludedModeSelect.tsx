"use client";

import {
  EXCLUSION_MODE_OPTIONS,
  type ExclusionMode,
} from "@/lib/dashboard/exclusion-mode";

/** Mobile fallback for the exclusion-mode toggle (design/dashboard-mobile.jpeg's "Excluded: Folded" dropdown) — a native `<select>` in place of the desktop `SegmentedControl`. */
export function ExcludedModeSelect({
  value,
  onChange,
}: {
  value: ExclusionMode;
  onChange: (value: ExclusionMode) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-600">
      <span className="sr-only">Exclusions</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ExclusionMode)}
        className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
      >
        {EXCLUSION_MODE_OPTIONS.map((option) => (
          <option key={option.key} value={option.key}>
            Exclusions : {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
