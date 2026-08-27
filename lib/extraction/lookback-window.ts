export type LookbackWindow =
  { type: "24h" } | { type: "3d" } | { type: "since_date"; since: Date };

/**
 * Deterministic post-extraction filtering (CLAUDE.md decision #1) — the LLM
 * only normalizes `datePosted`, it never decides what's in/out of window. A
 * listing with no usable date signal at all (`null`, or a string that
 * doesn't parse to a valid `Date`) is excluded from the run, not guessed at.
 *
 * `window.since` must be a real `Date` instance by the time it reaches this
 * function — see the coercion note on `LookbackWindow` payloads in
 * `/trigger/scrape-*.ts` for why that isn't automatic.
 */
export function isWithinLookbackWindow(
  datePosted: string | null,
  window: LookbackWindow,
  now: Date = new Date(),
): boolean {
  if (!datePosted) return false;
  const posted = new Date(datePosted);
  if (Number.isNaN(posted.getTime())) return false;

  if (window.type === "since_date") {
    return posted >= window.since;
  }

  const cutoff = new Date(now);
  if (window.type === "24h") cutoff.setDate(cutoff.getDate() - 1);
  else cutoff.setDate(cutoff.getDate() - 3);

  return posted >= cutoff;
}
