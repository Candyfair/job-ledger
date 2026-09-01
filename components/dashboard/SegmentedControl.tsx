"use client";

export type SegmentOption<T extends string> = { key: T; label: string };

/**
 * Generic pill-segmented toggle, extracted from
 * `components/trigger/LookbackSelector.tsx`'s visual pattern (pill segments,
 * active = solid black) so the dashboard's Folded/Revealed/Hidden control
 * doesn't duplicate that styling independently.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex w-fit rounded-full bg-zinc-100 p-1">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={value === option.key}
          className={
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors " +
            (value === option.key
              ? "bg-black text-white"
              : "text-zinc-600 hover:text-black")
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
