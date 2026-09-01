import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import { getRunStatus } from "@/lib/dashboard/get-run-status";

/**
 * Polled by the dashboard while a run's derived status is `"running"` (see
 * `lib/dashboard/get-run-status.ts` for the derivation and its known blind
 * spots — SPEC.md §9). Ownership: an anonymous caller only sees `userId IS
 * NULL` runs; an authenticated caller additionally sees their own runs.
 * Never distinguishes "doesn't exist" from "not yours" — both 404, so
 * existence is never leaked.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const session = await requireSession();
  const { runId } = await params;

  const payload = await getRunStatus(runId, session);
  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(payload);
}
