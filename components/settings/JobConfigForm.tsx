"use client";

import { useState } from "react";

export type JobConfigFormValues = {
  title: string;
  keywords: string[];
  location: string | null;
};

function keywordsToInput(keywords: string[]) {
  return keywords.join(", ");
}

/** Comma-separated free text → trimmed, non-empty keyword array. Also used
 * by `components/trigger/AdHocSearchFields.tsx` for the anonymous trigger
 * form's Keywords field, which maps to the same shape. */
export function inputToKeywords(input: string) {
  return input
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function JobConfigForm({
  initial,
  onSave,
  onCancel,
  saving = false,
}: {
  initial?: JobConfigFormValues;
  onSave: (values: JobConfigFormValues) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [keywordsInput, setKeywordsInput] = useState(
    initial ? keywordsToInput(initial.keywords) : "",
  );
  const [location, setLocation] = useState(initial?.location ?? "");

  return (
    <form
      className="flex flex-col gap-3 rounded border border-zinc-300 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title: title.trim(),
          keywords: inputToKeywords(keywordsInput),
          location: location.trim() === "" ? null : location.trim(),
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="job-config-title"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          JOB TITLE
        </label>
        <input
          id="job-config-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Senior Frontend Engineer"
          required
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="job-config-keywords"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          KEYWORDS
        </label>
        <input
          id="job-config-keywords"
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="e.g. React, TypeScript"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="job-config-location"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          LOCATION
        </label>
        <input
          id="job-config-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Paris or Remote"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
