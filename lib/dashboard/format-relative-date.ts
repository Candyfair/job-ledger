/**
 * French relative-time label for a posted/triggered date (design/dashboard.jpeg's
 * "2h ago"/"yesterday" style, translated per SPEC.md §7 — "UI language:
 * French throughout").
 */
export function formatRelativeDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "à l'instant";
  if (diffHours < 24) return `il y a ${diffHours} h`;
  if (diffDays === 1) return "hier";
  if (diffDays < 7) return `il y a ${diffDays} j`;

  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Short "il y a N min" label for the footer's last-write timestamp. */
export function formatMinutesAgo(iso: string): string {
  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / (60 * 1000)),
  );
  if (diffMinutes < 1) return "à l'instant";
  return `il y a ${diffMinutes} min`;
}

/** "aujourd'hui à 09:12" / "21 août · 09:12" — run-history strip + footer. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (new Date().toDateString() === date.toDateString()) {
    return `aujourd'hui à ${time}`;
  }
  const day = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  return `${day} · ${time}`;
}
