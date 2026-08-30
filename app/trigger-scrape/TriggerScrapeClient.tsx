"use client";

import { useState } from "react";
import Link from "next/link";
import { SITES, SITE_LABELS, SITE_CODES } from "@/lib/sites";
import { MODEL_OPTIONS } from "@/lib/extraction/model-options";
import type { ModelUsed } from "@/lib/extraction/adapter-registry";
import { CheckableList } from "@/components/trigger/CheckableList";
import {
  LookbackSelector,
  type LookbackValue,
} from "@/components/trigger/LookbackSelector";
import { ModelChoice } from "@/components/trigger/ModelChoice";
import {
  AdHocSearchFields,
  EMPTY_AD_HOC_SEARCH,
  isAdHocSearchValid,
  type AdHocSearchValues,
} from "@/components/trigger/AdHocSearchFields";
import { inputToKeywords } from "@/components/settings/JobConfigForm";

type JobConfig = {
  id: string;
  title: string;
  keywords: string[];
  location: string | null;
};

function lookbackLabel(value: LookbackValue | null): string {
  if (value === "24h") return "last 24h";
  if (value === "3d") return "last 3 days";
  if (value !== null) return `since ${value.since}`;
  return "no window yet";
}

/**
 * Top-level trigger-scrape form (design/trigger.jpeg, design/trigger-anonymous.jpeg).
 * Owns all form state and the `POST /api/scrape/trigger` call. Branches
 * on `isAuthenticated` for the Job-configs-vs-ad-hoc-search section only —
 * Lookback, Sites, and Model are shared between both variants.
 *
 * Submit stays disabled until every section the API requires is non-empty
 * (sites, model's lookback, and either job configs or a valid ad-hoc
 * search) — mirrors the route's own 400 conditions client-side so an empty
 * selection never round-trips to the server only to be rejected.
 *
 * On success, shows an inline confirmation with the returned `runId`
 * instead of redirecting: `/` is not a real dashboard yet (still the
 * unmodified create-next-app starter), so there is nothing meaningful to
 * navigate to. Revisit once the dashboard exists.
 */
export function TriggerScrapeClient({
  isAuthenticated,
  initialJobConfigs,
}: {
  isAuthenticated: boolean;
  initialJobConfigs: JobConfig[];
}) {
  const [lookback, setLookback] = useState<LookbackValue | null>("24h");
  const [selectedJobConfigIds, setSelectedJobConfigIds] = useState(
    initialJobConfigs.map((c) => c.id),
  );
  const [selectedSites, setSelectedSites] = useState<string[]>([...SITES]);
  const [model, setModel] = useState<ModelUsed>("claude_haiku");
  const [adHoc, setAdHoc] = useState<AdHocSearchValues>(EMPTY_AD_HOC_SEARCH);
  const [submitting, setSubmitting] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchValid = isAuthenticated
    ? selectedJobConfigIds.length > 0
    : isAdHocSearchValid(adHoc);
  const canSubmit =
    lookback !== null && selectedSites.length > 0 && searchValid;

  const modelLabel =
    MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || lookback === null) return;

    setSubmitting(true);
    setError(null);
    setRunId(null);

    try {
      const body = isAuthenticated
        ? {
            lookbackWindow: lookback,
            sites: selectedSites,
            model,
            jobConfigIds: selectedJobConfigIds,
          }
        : {
            lookbackWindow: lookback,
            sites: selectedSites,
            model,
            adHocSearch: {
              title: adHoc.title.trim(),
              keywords: inputToKeywords(adHoc.keywordsInput),
              location: adHoc.location.trim() || undefined,
            },
          };

      const res = await fetch("/api/scrape/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong triggering the scrape.");
        return;
      }

      setRunId(data.runId);
    } catch {
      setError("Something went wrong triggering the scrape.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b-4 border-black bg-zinc-100 px-6 py-6">
        <div className="mx-auto flex max-w-2xl items-baseline justify-between">
          <h1 className="text-3xl font-bold">Trigger a Scrape</h1>
          <Link
            href="/"
            className="text-xs font-medium tracking-wide text-blue-700 hover:underline"
          >
            ← BACK TO THE LEDGER
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-8">
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {runId && (
          <p role="status" className="text-sm text-green-700">
            Scrape triggered — run <span className="font-mono">{runId}</span>.
            There&apos;s no dashboard yet to show results on, but the run has
            been queued.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-10">
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Lookback window</h2>
              <p className="text-sm text-zinc-600">
                How far back to pull listings from each site.
              </p>
            </div>
            <LookbackSelector value={lookback} onChange={setLookback} />
          </section>

          {isAuthenticated ? (
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">Job configs</h2>
                <p className="text-sm text-zinc-600">
                  Search profiles to run this scrape against.
                </p>
              </div>
              <CheckableList
                items={initialJobConfigs.map((c) => ({
                  id: c.id,
                  label: c.title,
                  subtitle: c.location ?? "Anywhere",
                }))}
                selectedIds={selectedJobConfigIds}
                onChange={setSelectedJobConfigIds}
              />
            </section>
          ) : (
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">This search</h2>
              </div>
              <AdHocSearchFields values={adHoc} onChange={setAdHoc} />
            </section>
          )}

          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Sites</h2>
              <p className="text-sm text-zinc-600">
                Sources to scrape in this run.
              </p>
            </div>
            <CheckableList
              items={SITES.map((site) => ({
                id: site,
                label: SITE_LABELS[site],
                badge: SITE_CODES[site],
              }))}
              selectedIds={selectedSites}
              onChange={setSelectedSites}
            />
          </section>

          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Model</h2>
              <p className="text-sm text-zinc-600">
                Which model classifies and de-duplicates listings for this run.
              </p>
            </div>
            <ModelChoice value={model} onChange={setModel} />
          </section>

          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              {isAuthenticated
                ? `${selectedJobConfigIds.length} configs`
                : searchValid
                  ? "search ready"
                  : "no search yet"}{" "}
              · {selectedSites.length} sites · {modelLabel} ·{" "}
              {lookbackLabel(lookback)}
            </p>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Trigger scrape
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
