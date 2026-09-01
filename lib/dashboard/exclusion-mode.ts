/**
 * Three-state exclusion visibility (SPEC.md §3): client-side UI state only,
 * never persisted, resets to "folded" on reload.
 *
 * - folded (default): excluded listings shown as a collapsed struck-through
 *   line; a per-listing "reveal" link expands just that one row to the full
 *   column layout.
 * - revealed: every excluded listing already shown at the full expanded
 *   layout — no per-listing reveal control left to interact with.
 * - hidden: excluded listings removed from view entirely, and dropped from
 *   every count the toolbar summary shows (it describes what's currently
 *   shown, not a permanent ledger total).
 */
export type ExclusionMode = "folded" | "revealed" | "hidden";

export const EXCLUSION_MODE_OPTIONS: { key: ExclusionMode; label: string }[] = [
  { key: "folded", label: "Replié" },
  { key: "revealed", label: "Révélé" },
  { key: "hidden", label: "Masqué" },
];
