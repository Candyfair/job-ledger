import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import {
  getRunHistory,
  type RunHistoryCursor,
} from "@/lib/dashboard/run-history";
import { decodeCursor, encodeCursor } from "@/lib/dashboard/cursor";

/**
 * "Load more" for the dashboard's run-history strip. Authenticated only —
 * run history is never shown to anonymous visitors (SPEC.md §1/§3).
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let cursor: RunHistoryCursor | undefined;
  try {
    cursor = decodeCursor<RunHistoryCursor>(searchParams.get("cursor"));
  } catch {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const { runs, nextCursor } = await getRunHistory({
    userId: session.user.id,
    cursor,
  });

  return NextResponse.json({ runs, nextCursor: encodeCursor(nextCursor) });
}
