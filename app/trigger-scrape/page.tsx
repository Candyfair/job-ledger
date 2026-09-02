import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";
import { TriggerScrapeClient } from "./TriggerScrapeClient";

/**
 * Renders for both authenticated and anonymous visitors — unlike
 * `app/settings/page.tsx`, `requireSession()` returning `null` here is an
 * expected branch, not a redirect-to-sign-in case (mirrors how
 * `POST /api/scrape/trigger` itself branches on session presence rather
 * than rejecting anonymous callers).
 */
export default async function TriggerScrapePage() {
  const session = await requireSession();

  const jobConfigs = session
    ? await db
        .select()
        .from(jobConfig)
        .where(eq(jobConfig.userId, session.user.id))
        .orderBy(jobConfig.createdAt)
    : [];

  return (
    <TriggerScrapeClient
      isAuthenticated={session !== null}
      initialJobConfigs={jobConfigs.map((c) => ({
        id: c.id,
        title: c.title,
        excludedKeywords: c.excludedKeywords,
        location: c.location,
      }))}
    />
  );
}
