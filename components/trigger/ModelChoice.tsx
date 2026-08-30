"use client";

import { MODEL_OPTIONS } from "@/lib/extraction/model-options";
import type { ModelUsed } from "@/lib/extraction/adapter-registry";

export function ModelChoice({
  value,
  onChange,
}: {
  value: ModelUsed;
  onChange: (value: ModelUsed) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {MODEL_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            className={
              "flex cursor-pointer items-start gap-3 rounded border p-4 " +
              (selected
                ? "border-blue-600 bg-blue-50"
                : "border-zinc-300 bg-white")
            }
          >
            <input
              type="radio"
              name="model"
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-zinc-900">
                {option.label}
              </span>
              <span className="text-sm text-zinc-600">
                {option.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
