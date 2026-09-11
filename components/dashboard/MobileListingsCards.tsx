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

/**
 * Mobile card layout (design/dashboard-mobile.jpeg). Folded excluded cards
 * (the default mode) still render as a compact 2-line summary/detail block.
 * Kept cards, and excluded cards once the global "Revealed" mode is on,
 * share the same title/company/meta-row card layout (fixed 2026-09-11, same
 * issue as the desktop table — see DesktopListingsTable).
 */
export function MobileListingsCards({
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
    <ul className="flex flex-col divide-y divide-zinc-200 md:hidden">
      {groups.map((group) => {
        const expanded = expandedGroupIds.has(group.primary.id);
        return (
          <Fragment key={group.primary.id}>
            <MobileListingCard
              listing={group.primary}
              mode={mode}
              duplicateCount={group.duplicates.length}
              groupExpanded={expanded}
              onToggleGroup={() => onToggleGroup(group.primary.id)}
            />
            {expanded &&
              group.duplicates.map((duplicate) => (
                <MobileListingCard
                  key={duplicate.id}
                  listing={duplicate}
                  mode={mode}
                />
              ))}
          </Fragment>
        );
      })}
    </ul>
  );
}

function MobileListingCard({
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

  if (excluded && mode === "folded") {
    // "hidden" never reaches here — excluded listings are filtered out
    // before grouping (see the DashboardClient caller).
    return (
      <li className="py-3">
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
      </li>
    );
  }

  // Kept listings, and excluded listings once "Revealed" is on, share this
  // same card layout — only the title styling and the EXCLU line differ.
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between">
        <span
          className={
            excluded
              ? "font-medium text-zinc-500 line-through"
              : "font-medium text-zinc-900"
          }
        >
          {listing.title}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">●</span>
      </div>
      {excluded && (
        <span className="text-[11px] font-medium tracking-wide text-zinc-500">
          EXCLU · {(listing.excludedByKeyword ?? []).join(", ")}
        </span>
      )}
      <span
        className={"text-sm" + (excluded ? " text-zinc-500" : " text-zinc-700")}
      >
        {listing.company ?? "—"}
      </span>
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <SiteBadge site={listing.site} />
        <span>{formatRelativeDate(listing.datePosted)}</span>
        <span>{listing.salaryRaw ?? "—"}</span>
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-blue-700 hover:underline"
        >
          Ouvrir ↗
        </a>
      </div>
      {duplicateCount > 0 && (
        <DuplicateGroupExpander
          count={duplicateCount}
          expanded={groupExpanded}
          onToggle={onToggleGroup ?? (() => {})}
        />
      )}
    </li>
  );
}

function ExcludedSummaryLine({ listing }: { listing: ListingDTO }) {
  return (
    <div className="flex flex-col gap-0.5 text-zinc-500">
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
    <div className="mt-1 flex items-center gap-3 text-zinc-500">
      <SiteBadge site={listing.site} />
      <span>{formatRelativeDate(listing.datePosted)}</span>
      <span>{listing.salaryRaw ?? "—"}</span>
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-blue-700 hover:underline"
      >
        Ouvrir ↗
      </a>
    </div>
  );
}
