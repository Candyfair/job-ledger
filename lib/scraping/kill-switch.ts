/**
 * Global scraping kill switch (SPEC.md §7, DEPLOYMENT.md Incident Runbook).
 * Reads `SCRAPING_KILL_SWITCH` on every call rather than caching it at module
 * load — same convention as `checkTriggerRateLimit` — so tests can mock
 * `process.env` per case and an operator's flip takes effect on the next
 * request/task without needing the process to restart.
 *
 * Only the exact string `"true"` activates the switch; unset, `"false"`,
 * empty, or any other value leaves scraping enabled, so a malformed env var
 * never silently disables the app.
 */
export function isKillSwitchActive(): boolean {
  return process.env.SCRAPING_KILL_SWITCH === "true";
}
