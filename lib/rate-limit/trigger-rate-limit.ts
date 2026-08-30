import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitCounter } from "@/drizzle/schema";

const WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 5;

function resolveLimit(): number {
  const envLimit = Number(process.env.TRIGGER_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_LIMIT;
}

/**
 * Fixed-window per-IP rate limiter for `POST /api/scrape/trigger`
 * (SPEC.md §7). The window length is one hour; the threshold is read from
 * `TRIGGER_RATE_LIMIT_PER_HOUR` on every call (not cached at module load) so
 * tests can override it per case, defaulting to {@link DEFAULT_LIMIT}.
 *
 * A missing row, or one whose `windowStart` is more than an hour old, resets
 * the counter to `{ windowStart: now, count: 1 }` and allows the request.
 * Otherwise the request is allowed and counted only while `count` is still
 * under the limit; at or over it, the request is rejected without writing —
 * the caller must not create a `ScrapeRun` for a rejected trigger.
 *
 * This is read-then-write, not a single atomic statement: two requests from
 * the same IP arriving within the same tick can both read the same `count`
 * and both write the same incremented value, undercounting by one. Accepted
 * as a benign race given this project's traffic profile (a single-user demo
 * app, not a multi-tenant service) rather than reaching for an atomic
 * `UPDATE ... SET count = count + 1 RETURNING`.
 */
export async function checkTriggerRateLimit(
  ipAddress: string,
): Promise<{ allowed: boolean }> {
  const limit = resolveLimit();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(rateLimitCounter)
    .where(eq(rateLimitCounter.ipAddress, ipAddress));

  const windowElapsed =
    !existing || now.getTime() - existing.windowStart.getTime() >= WINDOW_MS;

  if (!windowElapsed && existing.count >= limit) {
    return { allowed: false };
  }

  const next = windowElapsed
    ? { windowStart: now, count: 1 }
    : { windowStart: existing.windowStart, count: existing.count + 1 };

  await db
    .insert(rateLimitCounter)
    .values({ ipAddress, ...next })
    .onConflictDoUpdate({ target: rateLimitCounter.ipAddress, set: next });

  return { allowed: true };
}
