"use client";

import { useState } from "react";

export type JobConfigFormValues = {
  title: string;
  excludedKeywords: string[];
  location: string | null;
};

function keywordsToInput(keywords: string[]) {
  return keywords.join(", ");
}

/** Comma-separated free text → trimmed, non-empty keyword array. Also used
 * by the anonymous ad hoc search's excluded-keywords field (`app/HomeClient
 * .tsx`), which maps to the same shape. */
export function inputToKeywords(input: string) {
  return input
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * A plain container, not a `<form>` — its only mount point (`app/HomeClient
 * .tsx`) renders it inline inside the page's own outer trigger `<form>`, and
 * nesting a `<form>` inside a `<form>` is invalid HTML that broke both the
 * browser's implicit form association and hydration (fixed 2026-09-11).
 * "Enregistrer" is a plain button that calls `onSave` directly instead of
 * relying on a submit event; native `required`-field validation goes with
 * it, so the button stays disabled until the title is non-blank instead.
 */
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
  const [excludedKeywordsInput, setExcludedKeywordsInput] = useState(
    initial ? keywordsToInput(initial.excludedKeywords) : "",
  );
  const [location, setLocation] = useState(initial?.location ?? "");

  const canSave = title.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      excludedKeywords: inputToKeywords(excludedKeywordsInput),
      location: location.trim() === "" ? null : location.trim(),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-zinc-300 bg-white p-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="job-config-title"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          INTITULÉ DU POSTE
        </label>
        <input
          id="job-config-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ex. Développeur Frontend Senior"
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="job-config-excluded-keywords"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          MOTS-CLÉS À EXCLURE
        </label>
        <input
          id="job-config-excluded-keywords"
          value={excludedKeywordsInput}
          onChange={(e) => setExcludedKeywordsInput(e.target.value)}
          placeholder="ex. stage, senior, PHP"
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="job-config-location"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          LIEU
        </label>
        <input
          id="job-config-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="ex. Paris ou Télétravail"
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !canSave}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
