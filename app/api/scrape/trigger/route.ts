import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db";
import { jobConfig, scrapeRun } from "@/drizzle/schema";
import { requireSession } from "@/lib/require-session";
import { checkTriggerRateLimit } from "@/lib/rate-limit/trigger-rate-limit";
import { isKillSwitchActive } from "@/lib/scraping/kill-switch";
import { SITES, type Site } from "@/lib/sites";
import type { ModelUsed } from "@/lib/extraction/adapter-registry";
import type { LookbackWindow } from "@/lib/extraction/lookback-window";
import type { ScrapeSitePayload } from "@/lib/scraping/run-scrape";
import type { scrapeApec } from "@/trigger/scrape-apec";
import type { scrapeHellowork } from "@/trigger/scrape-hellowork";

// Both models have a real ExtractionAdapter now (see adapter-registry.ts).
// Kept as an explicit allowlist — rather than trusting the persisted enum
// directly — so a model reserved on `modelUsedEnum` ahead of its adapter
// being wired still gets a clear 400 here instead of a Trigger.dev task
// failing mid-run.
const AVAILABLE_MODELS: readonly ModelUsed[] = [
  "claude_haiku",
  "deepseek_v4_flash",
];

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

function parseLookbackWindow(input: unknown): LookbackWindow | null {
  if (input === "24h" || input === "3d") return { type: input };
  if (
    input !== null &&
    typeof input === "object" &&
    typeof (input as { since?: unknown }).since === "string"
  ) {
    const since = new Date((input as { since: string }).since);
    if (Number.isNaN(since.getTime())) return null;
    return { type: "since_date", since };
  }
  return null;
}

function parseSites(input: unknown): Site[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const allSites: readonly string[] = SITES;
  if (!input.every((site) => allSites.includes(site))) return null;
  return input as Site[];
}

function parseModel(input: unknown): ModelUsed | null {
  const availableModels: readonly string[] = AVAILABLE_MODELS;
  return typeof input === "string" && availableModels.includes(input)
    ? (input as ModelUsed)
    : null;
}

/** Enqueues one `scrape-<site>` Trigger.dev task, resolving the task's own
 * type via `import type` so the Playwright-heavy task modules (see
 * trigger.config.ts's build extension) never enter this route's runtime
 * bundle. */
function triggerSiteTask(site: Site, payload: ScrapeSitePayload) {
  return site === "apec"
    ? tasks.trigger<typeof scrapeApec>("scrape-apec", payload)
    : tasks.trigger<typeof scrapeHellowork>("scrape-hellowork", payload);
}

/**
 * Creates a `ScrapeRun` and fans out one Trigger.dev task per (site,
 * `JobConfig`) pair for authenticated callers, or one per site sharing a
 * single ad-hoc search for anonymous callers (SPEC.md §3, §4). Rate-limited
 * per caller IP (`checkTriggerRateLimit`) before any write — a rejected
 * request never creates a `ScrapeRun`.
 *
 * `jobConfigIds` supplied by an authenticated caller are scoped to their own
 * rows; ids that don't belong to the caller (or don't exist) are silently
 * dropped rather than individually rejected — only a fully-empty resolution
 * (none of the supplied ids belong to the caller) is a 400. This mirrors how
 * a stale id in a multi-select would age out of an owner's own list.
 *
 * Side effects: `RateLimitCounter` upsert (via `checkTriggerRateLimit`);
 * `ScrapeRun` insert on success; one Trigger.dev task enqueued per fan-out
 * unit above (each task independently writes `Listing` rows and may upsert
 * `SiteStatus` — see `runSiteScrape`). Task completion is never awaited —
 * this only waits for Trigger.dev to acknowledge the enqueue.
 *
 * The kill switch (`isKillSwitchActive`) is checked before the rate limit
 * and before any database access — an operator-initiated stop takes
 * priority over even counting the request. It returns 503, not 429: this is
 * "the service is deliberately off," not "you're sending too many
 * requests," so it gets its own status code despite sharing the
 * `{ error }` body shape with the rate-limit rejection.
 */
export async function POST(request: Request) {
  if (isKillSwitchActive()) {
    return NextResponse.json(
      { error: "Scraping is temporarily disabled by the administrator" },
      { status: 503 },
    );
  }

  const ip = getClientIp(request);
  const { allowed } = await checkTriggerRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many scrape requests from this IP — try again later" },
      { status: 429 },
    );
  }

  const body = await request.json();
  const { lookbackWindow, sites, model, jobConfigIds, adHocSearch } =
    body ?? {};

  const lookback = parseLookbackWindow(lookbackWindow);
  if (!lookback) {
    return NextResponse.json(
      { error: "lookbackWindow must be '24h', '3d', or { since: ISO date }" },
      { status: 400 },
    );
  }

  const parsedSites = parseSites(sites);
  if (!parsedSites) {
    return NextResponse.json(
      { error: "sites must be a non-empty array of valid site ids" },
      { status: 400 },
    );
  }

  const parsedModel = parseModel(model);
  if (!parsedModel) {
    return NextResponse.json(
      { error: "model must be one of: " + AVAILABLE_MODELS.join(", ") },
      { status: 400 },
    );
  }

  const session = await requireSession();

  let resolvedJobConfigIds: string[] = [];
  let adHocConfig: {
    title: string;
    excludedKeywords: string[];
    location?: string | null;
  } | null = null;

  if (session) {
    if (
      !Array.isArray(jobConfigIds) ||
      jobConfigIds.length === 0 ||
      jobConfigIds.some((id) => typeof id !== "string")
    ) {
      return NextResponse.json(
        { error: "jobConfigIds is required for authenticated requests" },
        { status: 400 },
      );
    }

    const resolvedConfigs = await db
      .select()
      .from(jobConfig)
      .where(
        and(
          inArray(jobConfig.id, jobConfigIds),
          eq(jobConfig.userId, session.user.id),
        ),
      );

    if (resolvedConfigs.length === 0) {
      return NextResponse.json(
        { error: "None of the provided jobConfigIds belong to the caller" },
        { status: 400 },
      );
    }

    resolvedJobConfigIds = resolvedConfigs.map((config) => config.id);
  } else {
    if (
      !adHocSearch ||
      typeof adHocSearch.title !== "string" ||
      adHocSearch.title.trim() === "" ||
      (adHocSearch.excludedKeywords !== undefined &&
        (!Array.isArray(adHocSearch.excludedKeywords) ||
          adHocSearch.excludedKeywords.some(
            (k: unknown) => typeof k !== "string",
          ))) ||
      (adHocSearch.location !== undefined &&
        typeof adHocSearch.location !== "string")
    ) {
      return NextResponse.json(
        { error: "adHocSearch is required for anonymous requests" },
        { status: 400 },
      );
    }

    adHocConfig = {
      title: adHocSearch.title.trim(),
      excludedKeywords: adHocSearch.excludedKeywords ?? [],
      location: adHocSearch.location ?? null,
    };
  }

  const [run] = await db
    .insert(scrapeRun)
    .values({
      userId: session ? session.user.id : null,
      lookbackWindowType: lookback.type,
      lookbackSince: lookback.type === "since_date" ? lookback.since : null,
      modelUsed: parsedModel,
      sitesIncluded: parsedSites,
      jobConfigsIncluded: resolvedJobConfigIds,
    })
    .returning();

  const basePayload = {
    lookback,
    userId: session ? session.user.id : null,
    scrapeRunId: run.id,
    model: parsedModel,
  };

  const invocations = session
    ? parsedSites.flatMap((site) =>
        resolvedJobConfigIds.map((jobConfigId) =>
          triggerSiteTask(site, { ...basePayload, jobConfigId }),
        ),
      )
    : parsedSites.map((site) =>
        triggerSiteTask(site, { ...basePayload, adHocConfig: adHocConfig! }),
      );

  await Promise.all(invocations);

  return NextResponse.json({ runId: run.id }, { status: 201 });
}
