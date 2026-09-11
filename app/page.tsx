import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobConfig } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";
import { getLinkedProviders } from "@/lib/account/linked-providers";
import { AccountHeader } from "@/components/account/AccountHeader";
import { HomeClient } from "./HomeClient";

/**
 * The merged trigger / saved-search screen (SPEC.md §3, §6 — replaces the
 * former separate `/trigger-scrape` and `/settings` routes). Renders for both
 * authenticated and anonymous visitors: `requireSession()` returning `null`
 * is an expected branch, not a redirect-to-sign-in case (mirrors how
 * `POST /api/scrape/trigger` branches on session presence rather than
 * rejecting anonymous callers).
 *
 * Authenticated: the visitor's `JobConfig` rows (for both the pre-checked
 * scrape selection and inline CRUD). Anonymous: an empty list — the ad hoc
 * search replaces the job-config section entirely.
 */
export default async function HomePage() {
  const session = await requireSession();

  const jobConfigs = session
    ? await db
        .select()
        .from(jobConfig)
        .where(eq(jobConfig.userId, session.user.id))
        .orderBy(jobConfig.createdAt)
    : [];

  const providers = session ? await getLinkedProviders(session.user.id) : [];

  return (
    <>
      {session ? (
        <AccountHeader
          variant="authenticated"
          email={session.user.email}
          image={session.user.image ?? null}
          providers={providers}
        />
      ) : (
        <AccountHeader variant="anonymous" />
      )}
      <HomeClient
        isAuthenticated={session !== null}
        initialJobConfigs={jobConfigs.map((c) => ({
          id: c.id,
          title: c.title,
          excludedKeywords: c.excludedKeywords,
          location: c.location,
        }))}
      />
    </>
  );
}
