import Link from "next/link";

/**
 * Contextual claim-flow entry point #2 (SPEC.md §3 "Claiming an anonymous
 * run" — entry point #1 is `AccountHeader`'s generic sign-in link). Rendered
 * by `DashboardClient` only in `anonymous-run` mode, and only once that run
 * has resolved (`completed` or `partial_failure` — never while `running`).
 * The message text is verbatim from SPEC.md §3.
 */
export function ClaimRunPrompt({ runId }: { runId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <p>Créez un compte pour sauvegarder cette recherche.</p>
      <Link
        href={`/sign-up?runId=${encodeURIComponent(runId)}`}
        className="shrink-0 font-medium text-blue-700 hover:underline"
      >
        Créer un compte →
      </Link>
    </div>
  );
}
