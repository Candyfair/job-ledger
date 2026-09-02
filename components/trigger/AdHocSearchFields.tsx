"use client";

export type AdHocSearchValues = {
  title: string;
  excludedKeywordsInput: string;
  location: string;
};

export const EMPTY_AD_HOC_SEARCH: AdHocSearchValues = {
  title: "",
  excludedKeywordsInput: "",
  location: "",
};

/** `POST /api/scrape/trigger` requires only a non-empty `title` for
 * `adHocSearch` (`route.ts`'s validation); `excludedKeywords` and `location`
 * are both optional. */
export function isAdHocSearchValid(values: AdHocSearchValues): boolean {
  return values.title.trim() !== "";
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
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ad-hoc-excluded-keywords"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          EXCLUDED KEYWORDS
        </label>
        <input
          id="ad-hoc-excluded-keywords"
          value={values.excludedKeywordsInput}
          onChange={(e) =>
            onChange({ ...values, excludedKeywordsInput: e.target.value })
          }
          placeholder="e.g. stage, senior, PHP"
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
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
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>
    </div>
  );
}
