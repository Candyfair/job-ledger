import { NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import { getRunStatus } from "@/lib/dashboard/get-run-status";

/**
 * Polled by the dashboard while a run's status is `"running"`. `status` is
 * the persisted `ScrapeRun.status`, kept current by the run-status rollup
 * (SPEC.md §4) — no longer derived on read. `sites[].status` /
 * `sites[].failureCause` carry the extended `ScrapeRunSite` enums (SPEC.md
 * §7). See `lib/dashboard/get-run-status.ts`.
 *
 * Ownership: an anonymous caller only sees `userId IS NULL` runs; an
 * authenticated caller additionally sees their own runs. Never distinguishes
 * "doesn't exist" from "not yours" — both 404, so existence is never leaked.
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
