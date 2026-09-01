import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { scrapeRun } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";

export type Session = Awaited<ReturnType<typeof requireSession>>;

/**
 * Fetches a ScrapeRun the caller is allowed to see: an anonymous caller only
 * sees `userId IS NULL` (public) runs; an authenticated caller additionally
 * sees their own runs. Never a foreign authenticated user's run — a caller
 * asking for someone else's run gets `null`, indistinguishable from a
 * nonexistent id, so existence is never leaked. Shared by the status
 * endpoint and the listings endpoint so the ownership rule can't drift
 * between them.
 */
export async function getOwnedRun(runId: string, session: Session) {
  const ownership = session
    ? or(isNull(scrapeRun.userId), eq(scrapeRun.userId, session.user.id))
    : isNull(scrapeRun.userId);

  const [run] = await db
    .select()
    .from(scrapeRun)
    .where(and(eq(scrapeRun.id, runId), ownership));

  return run ?? null;
}
