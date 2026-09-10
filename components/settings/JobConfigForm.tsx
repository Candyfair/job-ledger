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

  return (
    <form
      className="flex flex-col gap-3 rounded border border-zinc-300 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title: title.trim(),
          excludedKeywords: inputToKeywords(excludedKeywordsInput),
          location: location.trim() === "" ? null : location.trim(),
        });
      }}
    >
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
          required
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
          type="submit"
          disabled={saving}
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
    </form>
  );
}
