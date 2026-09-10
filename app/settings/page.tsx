import { redirect } from "next/navigation";

/**
 * `/settings` was merged into `/` (SPEC.md §3, §6, §9 "Superseded
 * decisions" — 2026-09-07). Kept as a permanent redirect so any bookmark or
 * old link still lands on the saved-search management now living on `/`.
 */
export default function SettingsPage() {
  redirect("/");
}
