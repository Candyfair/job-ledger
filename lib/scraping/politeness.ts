// Scraping politeness primitives shared by every site scraper (SPEC.md §7).
// Per-site concurrency is enforced separately, on each Trigger.dev task's
// `queue.concurrencyLimit` (see `/trigger/scrape-*.ts`) — it can't live here
// because it's a platform-level control, not an in-process one.

/**
 * Awaits a plain timeout. Used between successive page fetches so a single
 * run doesn't hammer a site with no formal API (SPEC.md §7). Always pair it
 * with {@link randomDelayMs} rather than a fixed interval.
 */
export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A randomized inter-request delay in milliseconds (SPEC.md §7) — the jitter
 * matters more than the exact bounds: a fixed cadence is the easy signal for
 * a site to rate-limit or block on. Defaults to 1.5–3.5s, inclusive.
 */
export function randomDelayMs(min = 1500, max = 3500): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * The User-Agent every scraper's Playwright context sends.
 *
 * SPEC.md §7 calls for "a stable mainstream desktop Chrome UA" rather than
 * the literal Chromium default: headless Chromium advertises `HeadlessChrome`
 * in its default UA, which several of these job boards treat as a bot signal.
 * A plain, current desktop-Chrome string is the politer choice — it is not
 * fingerprint spoofing or stealth tooling (SPEC.md §2 rules those out), just
 * a request header that doesn't announce a headless browser.
 *
 * Bump the Chrome major version here periodically so it doesn't drift far
 * behind real-world Chrome.
 */
export const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
