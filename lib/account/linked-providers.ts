import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/drizzle/schema";

/**
 * The OAuth provider(s) linked to a user's account, for the account menu
 * (SPEC.md §3 "Account identification & sign-out"). Read from Better Auth's
 * `account` table — the field is `providerId` (`"github"` / `"google"`),
 * verified against Better Auth 1.7's generated `Account` model.
 *
 * De-duplicated on `providerId` in code rather than via `SELECT DISTINCT`:
 * Better Auth 1.7 scopes account identity by `(issuer, accountId)`
 * (DATA_MODEL.md), so two rows could in principle share a `providerId` while
 * differing by `issuer`. Account linking by verified e-mail makes that
 * unlikely here, but collapsing in code is robust to it regardless.
 *
 * Returns the provider ids sorted for a stable render order. An account with
 * no rows (shouldn't happen for an OAuth-only setup, but not worth throwing
 * over) yields `[]`.
 */
export async function getLinkedProviders(userId: string): Promise<string[]> {
  const rows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));

  return [...new Set(rows.map((r) => r.providerId))].sort();
}
