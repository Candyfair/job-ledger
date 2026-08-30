"use client";

import { useState } from "react";
import Link from "next/link";
import {
  JobConfigForm,
  type JobConfigFormValues,
} from "@/components/settings/JobConfigForm";

type JobConfig = {
  id: string;
  title: string;
  keywords: string[];
  location: string | null;
};

type ExclusionKeyword = {
  id: string;
  keyword: string;
};

export function SettingsClient({
  initialJobConfigs,
  initialExclusionKeywords,
}: {
  initialJobConfigs: JobConfig[];
  initialExclusionKeywords: ExclusionKeyword[];
}) {
  const [jobConfigs, setJobConfigs] = useState(initialJobConfigs);
  const [exclusionKeywords, setExclusionKeywords] = useState(
    initialExclusionKeywords,
  );
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSaveJobConfig(values: JobConfigFormValues) {
    setSaving(true);
    setError(null);
    try {
      if (editingId === "new") {
        const res = await fetch("/api/job-configs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error("Failed to create job config");
        const created = await res.json();
        setJobConfigs((prev) => [...prev, created]);
      } else if (editingId) {
        const res = await fetch(`/api/job-configs/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error("Failed to update job config");
        const updated = await res.json();
        setJobConfigs((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
      }
      setEditingId(null);
    } catch {
      setError("Something went wrong saving that job config.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteJobConfig(id: string) {
    setError(null);
    const previous = jobConfigs;
    setJobConfigs((prev) => prev.filter((c) => c.id !== id));
    const res = await fetch(`/api/job-configs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setJobConfigs(previous);
      setError("Something went wrong deleting that job config.");
    }
  }

  async function handleAddKeyword() {
    const keyword = newKeyword.trim();
    if (!keyword) return;
    setError(null);
    const res = await fetch("/api/exclusion-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    if (!res.ok) {
      setError("Something went wrong adding that keyword.");
      return;
    }
    const created = await res.json();
    setExclusionKeywords((prev) => [...prev, created]);
    setNewKeyword("");
  }

  async function handleDeleteKeyword(id: string) {
    setError(null);
    const previous = exclusionKeywords;
    setExclusionKeywords((prev) => prev.filter((k) => k.id !== id));
    const res = await fetch(`/api/exclusion-keywords/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setExclusionKeywords(previous);
      setError("Something went wrong removing that keyword.");
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b-4 border-black bg-zinc-100 px-6 py-6">
        <div className="mx-auto flex max-w-2xl items-baseline justify-between">
          <h1 className="text-3xl font-bold text-zinc-900">Settings</h1>
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

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Job configs</h2>
            <p className="text-sm text-zinc-600">
              Saved search profiles. Each one can be checked individually when
              you trigger a scrape.
            </p>
          </div>

          <ul className="flex flex-col divide-y divide-zinc-200 border-y border-zinc-200">
            {jobConfigs.map((config) =>
              editingId === config.id ? (
                <li key={config.id} className="py-4">
                  <JobConfigForm
                    initial={config}
                    saving={saving}
                    onSave={handleSaveJobConfig}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={config.id} className="flex flex-col gap-2 py-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium text-zinc-900">
                      {config.title}
                    </h3>
                    <div className="flex gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => setEditingId(config.id)}
                        className="text-blue-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteJobConfig(config.id)}
                        className="text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {config.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {config.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs text-zinc-900"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm text-zinc-600">
                    {config.location ?? "Anywhere"}
                  </p>
                </li>
              ),
            )}
          </ul>

          {editingId === "new" ? (
            <JobConfigForm
              saving={saving}
              onSave={handleSaveJobConfig}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingId("new")}
              className="self-start text-sm font-medium text-blue-700 hover:underline"
            >
              + Add a job config
            </button>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-900">
                Mots-clés exclus
              </h2>
              <span className="rounded bg-black px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white">
                GLOBAL
              </span>
            </div>
            <p className="text-sm text-zinc-600">
              Shared across every job config — a listing matching any keyword
              here is excluded no matter which search found it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {exclusionKeywords.map((k) => (
              <span
                key={k.id}
                className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs text-red-800"
              >
                {k.keyword}
                <button
                  type="button"
                  onClick={() => handleDeleteKeyword(k.id)}
                  aria-label={`Supprimer ${k.keyword}`}
                  className="text-red-600 hover:text-red-900"
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddKeyword();
            }}
          >
            <input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="ex. stage, junior"
              aria-label="Nouveau mot-clé exclu"
              className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
            <button
              type="submit"
              className="rounded bg-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900"
            >
              Add
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
