import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import { claimRun } from "@/lib/scraping/claim-run";

/**
 * Reattaches one anonymous `ScrapeRun` to the caller's account (SPEC.md §3
 * "Claiming an anonymous run" / §9 "Claim endpoint"). Called on mount from
 * `/` and `/dashboard` (`RunClaimOnMount`) whenever a `claimRunId` survived
 * the OAuth redirect round-trip via `callbackURL` (see `OAuthButtons`).
 *
 * Requires a session (401 otherwise — this route is only ever hit right
 * after sign-in/sign-up completes, so an unauthenticated call means the
 * param was reached some other way). `runId` itself isn't ownership-checked
 * beyond "currently unowned" — see `claimRun`. Always 200 on a
 * well-formed request whether or not a row was actually updated: an
 * already-claimed run is a silent no-op, not an error (SPEC.md §3).
 */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const runId = body?.runId;
  if (typeof runId !== "string" || runId === "") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  await claimRun(runId, session.user.id);
  return NextResponse.json({ ok: true });
}
