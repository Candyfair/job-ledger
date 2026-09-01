"use client";

import { Fragment } from "react";
import type { ListingDTO } from "@/lib/dashboard/listing-query";
import type { ListingGroup } from "@/lib/dashboard/group-listings";
import { isExcluded } from "@/lib/dashboard/group-listings";
import type { ExclusionMode } from "@/lib/dashboard/exclusion-mode";
import { formatRelativeDate } from "@/lib/dashboard/format-relative-date";
import { SiteBadge } from "@/components/dashboard/SiteBadge";
import { DuplicateGroupExpander } from "@/components/dashboard/DuplicateGroupExpander";
import { ExclusionRevealRow } from "@/components/dashboard/ExclusionRevealRow";

const COLUMN_COUNT = 6;

/**
 * Desktop table layout (design/dashboard.jpeg). Excluded rows are never
 * rendered as real `<td>` columns — they render as a single colSpan'd
 * summary/detail line, matching the mockup's compact excluded-row treatment
 * — so a `<tr>` never mixes "real columns" with "collapsed line" shapes.
 */
export function DesktopListingsTable({
  groups,
  mode,
  expandedGroupIds,
  onToggleGroup,
}: {
  groups: ListingGroup[];
  mode: ExclusionMode;
  expandedGroupIds: Set<string>;
  onToggleGroup: (primaryId: string) => void;
}) {
  return (
    <table className="hidden w-full text-sm md:table">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs font-medium tracking-wide text-zinc-500">
          <th className="py-2 pr-2 font-medium">PUBLIÉ</th>
          <th className="py-2 pr-2 font-medium">POSTE</th>
          <th className="py-2 pr-2 font-medium">ENTREPRISE</th>
          <th className="py-2 pr-2 font-medium">SITE</th>
          <th className="py-2 pr-2 font-medium">SALAIRE</th>
          <th className="py-2 text-right font-medium">OUVRIR</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const expanded = expandedGroupIds.has(group.primary.id);
          return (
            <Fragment key={group.primary.id}>
              <DesktopListingRow
                listing={group.primary}
                mode={mode}
                duplicateCount={group.duplicates.length}
                groupExpanded={expanded}
                onToggleGroup={() => onToggleGroup(group.primary.id)}
              />
              {expanded &&
                group.duplicates.map((duplicate) => (
                  <DesktopListingRow
                    key={duplicate.id}
                    listing={duplicate}
                    mode={mode}
                  />
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function DesktopListingRow({
  listing,
  mode,
  duplicateCount = 0,
  groupExpanded = false,
  onToggleGroup,
}: {
  listing: ListingDTO;
  mode: ExclusionMode;
  duplicateCount?: number;
  groupExpanded?: boolean;
  onToggleGroup?: () => void;
}) {
  const excluded = isExcluded(listing);

  if (!excluded) {
    return (
      <tr className="border-b border-zinc-100 align-top">
        <td className="py-2 pr-2 text-zinc-500">
          {formatRelativeDate(listing.datePosted)}
        </td>
        <td className="py-2 pr-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-zinc-900">{listing.title}</span>
            {duplicateCount > 0 && (
              <DuplicateGroupExpander
                count={duplicateCount}
                expanded={groupExpanded}
                onToggle={onToggleGroup ?? (() => {})}
              />
            )}
          </div>
        </td>
        <td className="py-2 pr-2 text-zinc-700">{listing.company ?? "—"}</td>
        <td className="py-2 pr-2">
          <SiteBadge site={listing.site} />
        </td>
        <td className="py-2 pr-2 text-zinc-700">{listing.salaryRaw ?? "—"}</td>
        <td className="py-2 text-right">
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 hover:underline"
          >
            Ouvrir ↗
          </a>
        </td>
      </tr>
    );
  }

  if (mode === "revealed") {
    return (
      <tr className="border-b border-zinc-100">
        <td colSpan={COLUMN_COUNT} className="py-2">
          <ExcludedSummaryLine listing={listing} />
          <ExcludedListingDetail listing={listing} />
        </td>
      </tr>
    );
  }

  // mode === "folded" — "hidden" never reaches here, excluded listings are
  // filtered out before grouping (see the DashboardClient caller).
  return (
    <tr className="border-b border-zinc-100">
      <td colSpan={COLUMN_COUNT} className="py-2">
        <ExclusionRevealRow>
          {(revealed) =>
            revealed ? (
              <>
                <ExcludedSummaryLine listing={listing} />
                <ExcludedListingDetail listing={listing} />
              </>
            ) : (
              <ExcludedSummaryLine listing={listing} />
            )
          }
        </ExclusionRevealRow>
      </td>
    </tr>
  );
}

function ExcludedSummaryLine({ listing }: { listing: ListingDTO }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 text-zinc-500">
      <span className="line-through">
        {listing.title}
        {listing.company ? ` — ${listing.company}` : ""}
      </span>
      <span className="text-[11px] font-medium tracking-wide">
        EXCLU · {(listing.excludedByKeyword ?? []).join(", ")}
      </span>
    </div>
  );
}

function ExcludedListingDetail({ listing }: { listing: ListingDTO }) {
  return (
    <div className="mt-1 flex items-center gap-4 text-zinc-500">
      <span className="w-16 shrink-0">
        {formatRelativeDate(listing.datePosted)}
      </span>
      <SiteBadge site={listing.site} />
      <span className="w-20 shrink-0">{listing.salaryRaw ?? "—"}</span>
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-blue-700 hover:underline"
      >
        Ouvrir ↗
      </a>
    </div>
  );
}
