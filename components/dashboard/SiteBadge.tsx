import { SITE_CODES, type Site } from "@/lib/sites";

/** Site badge, same bordered-mono style as `CheckableList`'s `item.badge`. */
export function SiteBadge({ site }: { site: Site }) {
  return (
    <span className="rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
      {SITE_CODES[site]}
    </span>
  );
}
