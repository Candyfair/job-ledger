import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import { getOwnedRun } from "@/lib/dashboard/run-ownership";
import {
  getListingsPage,
  type ListingCursor,
} from "@/lib/dashboard/listing-query";
import { decodeCursor, encodeCursor } from "@/lib/dashboard/cursor";

/**
 * "Load more" for the dashboard's listings table/cards. Scope: `?runId=`
 * for a single run — ownership-checked with the same composed rule as
 * `GET /api/scrape/status/:runId` (anonymous only sees public runs,
 * authenticated sees their own runs plus any public one) — or no `runId`
 * for the caller's own "all time" aggregate, which requires a session.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  let cursor: ListingCursor | undefined;
  try {
    cursor = decodeCursor<ListingCursor>(searchParams.get("cursor"));
  } catch {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  if (runId) {
    const run = await getOwnedRun(runId, session);
    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { listings, nextCursor } = await getListingsPage({ runId, cursor });
    return NextResponse.json({
      listings,
      nextCursor: encodeCursor(nextCursor),
    });
  }

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { listings, nextCursor } = await getListingsPage({
    ownerUserId: session.user.id,
    cursor,
  });
  return NextResponse.json({ listings, nextCursor: encodeCursor(nextCursor) });
}
