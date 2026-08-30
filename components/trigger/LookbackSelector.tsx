"use client";

/** The wire shape `POST /api/scrape/trigger` expects for `lookbackWindow`
 * (see `parseLookbackWindow` in `app/api/scrape/trigger/route.ts`) — `since`
 * is an ISO date string, not a `Date`, since it crosses a JSON boundary. */
export type LookbackValue = "24h" | "3d" | { since: string };

const SEGMENTS = [
  { key: "24h", label: "24 hours" },
  { key: "3d", label: "3 days" },
  { key: "since_date", label: "Since date" },
] as const;

type Segment = (typeof SEGMENTS)[number]["key"];

function segmentOf(value: LookbackValue | null): Segment {
  if (value === "24h" || value === "3d") return value;
  return "since_date";
}

/**
 * Three-way lookback picker (design/trigger.jpeg, design/trigger-anonymous.jpeg).
 * Selecting "24h"/"3d" commits immediately via `onChange`. Selecting "Since
 * date" reveals a native date input but does NOT commit a value until a date
 * is actually picked — `onChange(null)` is reported in the meantime so the
 * parent can hold the submit button disabled, the same way it already does
 * for an empty sites/job-configs/ad-hoc-search selection, rather than
 * silently sending an unparseable `{ since: "" }` to the API.
 */
export function LookbackSelector({
  value,
  onChange,
}: {
  value: LookbackValue | null;
  onChange: (value: LookbackValue | null) => void;
}) {
  const activeSegment = segmentOf(value);
  const sinceDate =
    value !== null && typeof value === "object" ? value.since : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit rounded-full bg-zinc-100 p-1">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={() => {
              if (segment.key === "since_date") {
                onChange(null);
              } else {
                onChange(segment.key);
              }
            }}
            className={
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors " +
              (activeSegment === segment.key
                ? "bg-black text-white"
                : "text-zinc-600 hover:text-black")
            }
          >
            {segment.label}
          </button>
        ))}
      </div>

      {activeSegment === "since_date" && (
        <input
          type="date"
          value={sinceDate}
          onChange={(e) =>
            onChange(e.target.value ? { since: e.target.value } : null)
          }
          aria-label="Since date"
          className="w-fit rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
