import { type Site, SITE_LABELS } from "@/lib/sites";
import { siteFailureCauseEnum } from "@/drizzle/schema";

/**
 * Why a site scraper was auto-deactivated — mirrors the
 * `site_failure_cause` pgEnum (`SiteStatus.lastFailureCause`). See SPEC.md §5.
 */
export type SiteFailureCause = (typeof siteFailureCauseEnum.enumValues)[number];

/**
 * The site served a recognized bot-verification interstitial (a Cloudflare-
 * style challenge page) instead of search results. Distinct from a markup
 * break: the markup didn't change, access was denied. Never retried or
 * worked around — circumventing a bot-protection measure crosses from
 * politeness into deliberate evasion (SPEC.md §2). Maps to the
 * `bot_challenge` failure cause.
 */
export class ScrapeBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeBlockedError";
  }
}

/**
 * The page loaded but its shape is unrecognized — a selector that should
 * match found nothing, or the results container isn't where it used to be.
 * Thrown for the cases a scraper can positively identify as "the site
 * changed"; an unclassified error out of a scraper (a raw Playwright
 * timeout, a navigation failure) is treated the same way by
 * {@link describeScrapeError}. Maps to the `markup_broken` failure cause.
 */
export class ScrapeMarkupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeMarkupError";
  }
}

// Substrings that appear on the common bot-verification / challenge pages
// these boards sit behind (Cloudflare "Just a moment…", generic
// "checking your browser" interstitials, Ray ID footers). Matched
// case-insensitively against the page's visible body text. Deliberately
// short and high-signal — a false positive deactivates the site for
// everyone, so err toward phrases that don't occur in normal listing copy.
const BOT_CHALLENGE_MARKERS = [
  "just a moment",
  "checking your browser",
  "additional verification required",
  "ray id",
  "verify you are human",
  "enable javascript and cookies to continue",
];

/**
 * True when `bodyText` looks like a bot-verification / challenge page rather
 * than real search results. Call it on the page's visible text right after
 * navigation, before trying to parse listings, and throw
 * {@link ScrapeBlockedError} on a hit.
 *
 * Intentionally a plain substring check, not a heuristic — see
 * {@link BOT_CHALLENGE_MARKERS} for why the list stays conservative.
 */
export function isBotChallengePage(bodyText: string): boolean {
  const haystack = bodyText.toLowerCase();
  return BOT_CHALLENGE_MARKERS.some((marker) => haystack.includes(marker));
}

/**
 * Classifies an error thrown out of a site scrape into the failure cause and
 * the French, user-facing "needs review" sentence to persist on
 * `SiteStatus` (SPEC.md §5). `ScrapeBlockedError` → `bot_challenge`;
 * everything else (`ScrapeMarkupError`, a bare Playwright timeout, a
 * navigation failure, a non-Error throw) → `markup_broken`, since an
 * unrecognized failure is far more likely to be a markup change than a
 * silent block.
 *
 * `note` is written to `lastErrorNote` verbatim and is what an authenticated
 * user sees on the settings page; it does not include the underlying
 * technical message.
 */
export function describeScrapeError(
  error: unknown,
  site: Site,
): { cause: SiteFailureCause; note: string } {
  const label = SITE_LABELS[site];
  if (error instanceof ScrapeBlockedError) {
    return {
      cause: "bot_challenge",
      note: `Accès à ${label} bloqué (protection anti-bot) — le site nécessite une vérification manuelle.`,
    };
  }
  return {
    cause: "markup_broken",
    note: `Impossible de récupérer les résultats de ${label} — le site a peut-être changé et doit être vérifié.`,
  };
}
