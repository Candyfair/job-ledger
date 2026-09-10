"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  JobConfigForm,
  inputToKeywords,
  type JobConfigFormValues,
} from "@/components/settings/JobConfigForm";

type JobConfig = {
  id: string;
  title: string;
  excludedKeywords: string[];
  location: string | null;
};

function lookbackLabel(value: LookbackValue | null): string {
  if (value === "24h") return "24 h";
  if (value === "3d") return "3 jours";
  if (value !== null) return `depuis le ${value.since}`;
  return "aucune période";
}

/**
 * The merged trigger / saved-search screen (SPEC.md §3, §6). Owns all form
 * state and the `POST /api/scrape/trigger` call, plus — authenticated only —
 * inline `JobConfig` CRUD against `/api/job-configs` (the former `/settings`
 * page, folded in here so a first-time user with zero configs lands directly
 * where they create one).
 *
 * Branches on `isAuthenticated` for the saved-searches-vs-ad-hoc section
 * only — Période, Sites and Modèle are shared. Submit stays disabled until
 * every section the API requires is non-empty (sites, a resolved lookback,
 * and either ≥1 checked job config or a valid ad hoc search), mirroring the
 * route's own 400 conditions so an empty selection never round-trips.
 *
 * On success it redirects to the dashboard (SPEC.md §3 step 4): `/dashboard`
 * for an authenticated run, `/dashboard?runId=<id>` for an anonymous one, so
 * progress is picked up by the dashboard's status banner.
 */
export function HomeClient({
  isAuthenticated,
  initialJobConfigs,
}: {
  isAuthenticated: boolean;
  initialJobConfigs: JobConfig[];
}) {
  const router = useRouter();

  const [lookback, setLookback] = useState<LookbackValue | null>("24h");
  const [jobConfigs, setJobConfigs] = useState(initialJobConfigs);
  const [selectedJobConfigIds, setSelectedJobConfigIds] = useState(
    initialJobConfigs.map((c) => c.id),
  );
  const [selectedSites, setSelectedSites] = useState<string[]>([...SITES]);
  const [model, setModel] = useState<ModelUsed>("claude_haiku");
  const [adHoc, setAdHoc] = useState<AdHocSearchValues>(EMPTY_AD_HOC_SEARCH);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const searchValid = isAuthenticated
    ? selectedJobConfigIds.length > 0
    : isAdHocSearchValid(adHoc);
  const canSubmit =
    lookback !== null && selectedSites.length > 0 && searchValid;

  const modelLabel =
    MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;

  async function handleSaveJobConfig(values: JobConfigFormValues) {
    setSavingConfig(true);
    setConfigError(null);
    try {
      if (editingId === "new") {
        const res = await fetch("/api/job-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error("create failed");
        const created: JobConfig = await res.json();
        setJobConfigs((prev) => [...prev, created]);
        // A freshly created search is checked by default, same as every
        // existing one on load (SPEC.md §3 — pre-checked, individually
        // uncheckable).
        setSelectedJobConfigIds((prev) => [...prev, created.id]);
      } else if (editingId) {
        const res = await fetch(`/api/job-configs/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error("update failed");
        const updated: JobConfig = await res.json();
        setJobConfigs((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
      }
      setEditingId(null);
    } catch {
      setConfigError("Impossible d'enregistrer cette recherche.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleDeleteJobConfig(id: string) {
    setConfigError(null);
    const previous = jobConfigs;
    setJobConfigs((prev) => prev.filter((c) => c.id !== id));
    setSelectedJobConfigIds((prev) =>
      prev.filter((selected) => selected !== id),
    );
    const res = await fetch(`/api/job-configs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setJobConfigs(previous);
      setConfigError("Impossible de supprimer cette recherche.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || lookback === null) return;

    setSubmitting(true);
    setSubmitError(null);

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
              excludedKeywords: inputToKeywords(adHoc.excludedKeywordsInput),
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
        setSubmitError(
          data.error ??
            "Une erreur est survenue lors du lancement du scraping.",
        );
        setSubmitting(false);
        return;
      }

      router.push(
        isAuthenticated ? "/dashboard" : `/dashboard?runId=${data.runId}`,
      );
    } catch {
      setSubmitError("Une erreur est survenue lors du lancement du scraping.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b-4 border-black bg-zinc-100 px-6 py-6">
        <div className="mx-auto flex max-w-2xl items-baseline justify-between">
          <h1 className="text-3xl font-bold text-zinc-900">
            Lancer un scraping
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-8">
        <p className="text-sm text-zinc-600">
          Lancez un scraping pour voir apparaître les offres ici.{" "}
          {isAuthenticated
            ? "Vos recherches et résultats restent liés à votre compte."
            : "Sans compte, vous recevrez un lien direct vers les résultats de votre recherche."}
        </p>

        {submitError && (
          <p role="alert" className="text-sm text-red-600">
            {submitError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-10">
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Période de recherche
              </h2>
              <p className="text-sm text-zinc-600">
                Jusqu&apos;où remonter pour récupérer les offres sur chaque
                site.
              </p>
            </div>
            <LookbackSelector value={lookback} onChange={setLookback} />
          </section>

          {isAuthenticated ? (
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Mes recherches
                </h2>
                <p className="text-sm text-zinc-600">
                  Les profils de recherche à inclure dans ce scraping. Toutes
                  cochées par défaut — décochez-en pour les exclure de ce run.
                </p>
              </div>

              {configError && (
                <p role="alert" className="text-sm text-red-600">
                  {configError}
                </p>
              )}

              <ul className="flex flex-col divide-y divide-zinc-200 border-y border-zinc-200">
                {jobConfigs.map((config) =>
                  editingId === config.id ? (
                    <li key={config.id} className="py-4">
                      <JobConfigForm
                        initial={config}
                        saving={savingConfig}
                        onSave={handleSaveJobConfig}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  ) : (
                    <li key={config.id} className="flex items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        id={`job-config-${config.id}`}
                        checked={selectedJobConfigIds.includes(config.id)}
                        onChange={() =>
                          setSelectedJobConfigIds((prev) =>
                            prev.includes(config.id)
                              ? prev.filter((s) => s !== config.id)
                              : [...prev, config.id],
                          )
                        }
                        className="mt-1 h-4 w-4"
                      />
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex items-start justify-between gap-3">
                          <label
                            htmlFor={`job-config-${config.id}`}
                            className="text-sm font-medium text-zinc-900"
                          >
                            {config.title}
                          </label>
                          <div className="flex gap-3 text-sm">
                            <button
                              type="button"
                              onClick={() => setEditingId(config.id)}
                              className="text-blue-700 hover:underline"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteJobConfig(config.id)}
                              className="text-red-700 hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                        {config.excludedKeywords.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium tracking-wide text-zinc-500">
                              Exclut :
                            </span>
                            {config.excludedKeywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs text-red-800"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-sm text-zinc-600">
                          {config.location ?? "Partout"}
                        </p>
                      </div>
                    </li>
                  ),
                )}
              </ul>

              {editingId === "new" ? (
                <JobConfigForm
                  saving={savingConfig}
                  onSave={handleSaveJobConfig}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingId("new")}
                  className="self-start text-sm font-medium text-blue-700 hover:underline"
                >
                  Ajouter une nouvelle recherche
                </button>
              )}
            </section>
          ) : (
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Cette recherche
                </h2>
              </div>
              <AdHocSearchFields values={adHoc} onChange={setAdHoc} />
            </section>
          )}

          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Sites</h2>
              <p className="text-sm text-zinc-600">
                Les sources à scraper lors de ce run.
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
              <h2 className="text-lg font-semibold text-zinc-900">Modèle</h2>
              <p className="text-sm text-zinc-600">
                Le modèle qui structure et dédoublonne les offres de ce run.
              </p>
            </div>
            <ModelChoice value={model} onChange={setModel} />
          </section>

          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              {isAuthenticated
                ? `${selectedJobConfigIds.length} recherches`
                : searchValid
                  ? "recherche prête"
                  : "aucune recherche"}{" "}
              · {selectedSites.length} sites · {modelLabel} ·{" "}
              {lookbackLabel(lookback)}
            </p>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Lancer le scraping
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
