import {
  botChallengeMessage,
  markupBrokenMessage,
} from "@/lib/scraping/errors";
import type { SiteRunStatus } from "@/lib/dashboard/assemble-run-status";
import type { RunStatusPayload } from "@/lib/dashboard/assemble-run-status";

/**
 * French copy for the dashboard's status banner (SPEC.md §3, decided
 * 2026-09-07). The single-line collapsed text and the running heading are
 * simple constants; the completion line for a `partial_failure` run is
 * assembled per-site below.
 */
export const BANNER_RUNNING_LINE = "Recherche en cours…";

/**
 * Pedagogical copy shown in the expanded banner — the politeness measures
 * (SPEC.md §7: randomized delay, one request in flight per site, a stable
 * desktop user-agent, never working around a bot challenge) and why
 * LinkedIn, Indeed and Welcome to the Jungle aren't scraped (SPEC.md §2:
 * ToS grounds for the first two, no equivalent keyword+location search
 * surface for the third). Exact wording is this session's call (SPEC.md §3
 * left it "to be drafted at implementation time").
 */
export const BANNER_PEDAGOGICAL_COPY =
  "Ce scraper applique une politique de politesse stricte : délai aléatoire " +
  "entre les requêtes, une seule requête à la fois par site, et une " +
  "signature de navigateur standard — jamais de contournement d'une " +
  "protection anti-bot. LinkedIn et Indeed ne sont pas scrapés : leurs " +
  "conditions d'utilisation interdisent l'automatisation. Welcome to the " +
  "Jungle non plus : sa recherche repose désormais sur un profil candidat " +
  "plutôt que sur des mots-clés et un lieu, une recherche déterministe " +
  "n'a donc plus prise sur ce site.";

/**
 * Per-site issue sentence for the banner's `partial_failure` completion
 * line. `failed` reuses the SPEC.md §5 sentences verbatim via
 * `lib/scraping/errors.ts` (`markup_broken` / `bot_challenge`) plus one for
 * `timeout` (the stale-run watchdog's failure cause, which §5 never
 * covered). `empty_extraction` and `skipped` have no §5 text at all — SPEC.md
 * §7 explicitly deferred their copy to this session. Returns `null` for a
 * site with nothing to report (`completed`, or still `pending`).
 */
export function siteIssueMessage(site: SiteRunStatus): string | null {
  if (site.status === "failed") {
    if (site.failureCause === "bot_challenge") {
      return botChallengeMessage(site.site);
    }
    if (site.failureCause === "timeout") {
      return `${site.label} n'a pas répondu à temps — la tâche a été interrompue automatiquement.`;
    }
    // markup_broken, or (defensively) a failed row with no recorded cause.
    return markupBrokenMessage(site.site);
  }
  if (site.status === "empty_extraction") {
    return `${site.label} n'a renvoyé aucune offre exploitable pour cette recherche.`;
  }
  if (site.status === "skipped") {
    return `${site.label} a été ignoré (scraping désactivé par l'administrateur).`;
  }
  return null;
}

/**
 * The banner's single completion line, shown once a run leaves `running`
 * (collapsed permanently, per SPEC.md §3; expanded, this session's call —
 * see `StatusBanner`). `completed` gets a short, generic confirmation;
 * `partial_failure` concatenates every site's {@link siteIssueMessage},
 * prefixed "Terminé — " per SPEC.md §3's example — the §5 sentences
 * themselves stay verbatim, only the prefix is added.
 */
export function bannerCompletionLine(status: RunStatusPayload): string {
  if (status.status === "completed") {
    const n = status.kept;
    return `Terminé — ${n} annonce${n === 1 ? "" : "s"} conservée${n === 1 ? "" : "s"}.`;
  }

  const issues = status.sites
    .map(siteIssueMessage)
    .filter((message): message is string => message !== null);

  // Defensive fallback: combineRunStatus only ever produces partial_failure
  // when at least one site is failed/empty_extraction or every site is
  // skipped, so `issues` should never be empty here.
  if (issues.length === 0) {
    return "Terminé — recherche partiellement aboutie.";
  }

  return `Terminé — ${issues.join(" ")}`;
}
