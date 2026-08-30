"use client";

import { inputToKeywords } from "@/components/settings/JobConfigForm";

export type AdHocSearchValues = {
  title: string;
  keywordsInput: string;
  location: string;
};

export const EMPTY_AD_HOC_SEARCH: AdHocSearchValues = {
  title: "",
  keywordsInput: "",
  location: "",
};

/** `POST /api/scrape/trigger` requires both a non-empty `title` and a
 * non-empty `keywords` array for `adHocSearch` (`route.ts`'s validation) —
 * `location` is the only optional field. */
export function isAdHocSearchValid(values: AdHocSearchValues): boolean {
  return (
    values.title.trim() !== "" &&
    inputToKeywords(values.keywordsInput).length > 0
  );
}

/** Anonymous-variant replacement for the Job configs section
 * (design/trigger-anonymous.jpeg's "This search" block) — a one-off,
 * never-persisted search. Controlled by the parent so it can compute
 * `isAdHocSearchValid` for the submit-disabled state. */
export function AdHocSearchFields({
  values,
  onChange,
}: {
  values: AdHocSearchValues;
  onChange: (values: AdHocSearchValues) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm italic text-zinc-600">
        A one-off search for this run only. Not saved — sign in to save searches
        for next time.
      </p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ad-hoc-title"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          JOB TITLE
        </label>
        <input
          id="ad-hoc-title"
          value={values.title}
          onChange={(e) => onChange({ ...values, title: e.target.value })}
          placeholder="e.g. Senior Frontend Engineer"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ad-hoc-keywords"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          KEYWORDS
        </label>
        <input
          id="ad-hoc-keywords"
          value={values.keywordsInput}
          onChange={(e) =>
            onChange({ ...values, keywordsInput: e.target.value })
          }
          placeholder="e.g. React, TypeScript"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ad-hoc-location"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          LOCATION
        </label>
        <input
          id="ad-hoc-location"
          value={values.location}
          onChange={(e) => onChange({ ...values, location: e.target.value })}
          placeholder="e.g. Paris or Remote"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
