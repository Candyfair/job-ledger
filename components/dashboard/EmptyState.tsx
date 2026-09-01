import Link from "next/link";

/**
 * Anonymous visitor, no `?runId=` (or it didn't resolve — SPEC.md §1/§3:
 * a foreign/nonexistent run renders the same state, never distinguishing
 * the two, to avoid leaking existence).
 */
export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900">The Job Ledger</h1>
      <p className="max-w-md text-sm text-zinc-600">
        Lancez un scraping pour voir apparaître les offres ici. Sans compte,
        vous recevrez un lien direct vers les résultats de votre recherche.
      </p>
      <Link
        href="/trigger-scrape"
        className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
      >
        Lancer un scraping
      </Link>
    </div>
  );
}
