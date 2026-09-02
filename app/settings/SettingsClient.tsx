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
  excludedKeywords: string[];
  location: string | null;
};

export function SettingsClient({
  initialJobConfigs,
}: {
  initialJobConfigs: JobConfig[];
}) {
  const [jobConfigs, setJobConfigs] = useState(initialJobConfigs);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [saving, setSaving] = useState(false);
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
                  {config.excludedKeywords.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium tracking-wide text-zinc-500">
                        Excludes:
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
      </main>
    </div>
  );
}
