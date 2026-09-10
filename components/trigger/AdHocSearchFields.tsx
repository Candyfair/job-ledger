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
        Une recherche ponctuelle, pour ce run uniquement. Non enregistrée —
        connectez-vous pour retrouver vos recherches la prochaine fois.
      </p>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ad-hoc-title"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          INTITULÉ DU POSTE
        </label>
        <input
          id="ad-hoc-title"
          value={values.title}
          onChange={(e) => onChange({ ...values, title: e.target.value })}
          placeholder="ex. Développeur Frontend Senior"
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ad-hoc-excluded-keywords"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          MOTS-CLÉS À EXCLURE
        </label>
        <input
          id="ad-hoc-excluded-keywords"
          value={values.excludedKeywordsInput}
          onChange={(e) =>
            onChange({ ...values, excludedKeywordsInput: e.target.value })
          }
          placeholder="ex. stage, senior, PHP"
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ad-hoc-location"
          className="text-xs font-medium tracking-wide text-zinc-600"
        >
          LIEU
        </label>
        <input
          id="ad-hoc-location"
          value={values.location}
          onChange={(e) => onChange({ ...values, location: e.target.value })}
          placeholder="ex. Paris ou Télétravail"
          className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>
    </div>
  );
}
