# DATA_MODEL.md — Jobs Scraping

Reference schema. Update when the real Prisma/Drizzle schema changes — this file should mirror it, not drift from it. Behavioral rules about _when_ these fields change (e.g. exclusion/duplicate logic) live in SPEC.md, not here.

## `User`

Managed by Better Auth (schema generated via `npx better-auth generate`, OAuth-only per SPEC.md §1). Also generates `session`, `account`, `verification` tables — not detailed here since app code doesn't touch their full shape directly. One exception (decided 2026-09-07): the account menu (SPEC.md §3) reads the linked OAuth provider(s) per user directly from the `account` table — exact field name to confirm against the actual Better Auth 1.7 generated schema at implementation time (likely `providerId`, not verified here). **Known gap**: `account` needs a hand-added `issuer` column (`text`, not null, unique together with `accountId`) — Better Auth 1.7's "account identity scoped by issuer" change, which neither `better-auth generate` nor `@better-auth/drizzle-adapter`'s codegen produce as of 1.7.1 (upstream gap, confirmed against their own 1-7-upgrade-guide). If a future `generate` run overwrites `drizzle/schema/auth.ts`, re-check whether upstream has caught up before dropping the manual column back in — see the comment in that file.

- `id` (`text`, Better Auth's own generated ID — **not** a Postgres-generated UUID; every FK to `user.id` from app tables must use `text`, not `uuid`, or the migration fails to match types)
- `email` (`text`, unique)
- `name` (`text`)
- `emailVerified` (`boolean`)
- `image` (`text`, nullable — OAuth avatar URL)
- `createdAt`, `updatedAt`

## `JobConfig`

One row per configured job search.

- `id` (`uuid`, `gen_random_uuid()`)
- `userId` (`text`, nullable — anonymous runs don't create one; FK → `user.id`, `onDelete: cascade`)
- `title` (e.g. "React front-end")
- `keywords` (e.g. `["React"]`, or `["React Native", "mobile"]` — this defines a _search pass_; "React" and "React Native/mobile" are two separate `JobConfig` rows, not one combined search, since combining keywords dilutes results on most of these sites' search UIs)
- `location` (geographic zone — **per config, not global**, so the tool stays generic for other installers with different searches; nullable)
- `createdAt`

## `SiteStatus`

Global per-site availability — a markup break affects that site's scraper for every search running against it, not one job config in isolation. One row per supported site, shared across all users (including anonymous).

- `site` (Welcome to the Jungle / Indeed / Apec.fr / HelloWork)
- `active` (boolean, default `true`; auto-set to `false` when that site's Playwright task fails — see SPEC.md §5)
- `lastErrorAt`, `lastErrorNote` (optional, feeds the "needs review" message)

## `ExclusionKeyword`

Global list, shared across all `JobConfig` rows for a given user (or global/anonymous for unauthenticated runs) — deliberately not per-config, since the added complexity wasn't worth it for marginal precision gain.

- `id` (`uuid`), `userId` (`text`, nullable, FK → `user.id`, `onDelete: cascade`), `keyword`, `createdAt`

## `ScrapeRun`

One row per triggered run.

- `id`, `userId` (nullable — anonymous runs don't create one at trigger time, but may be attached afterward via the anonymous run-claim flow, SPEC.md §3), `triggeredAt`, `lookbackWindow`, `modelUsed`, `sitesIncluded`, `jobConfigsIncluded`, `status` (written **only** by the run-status rollup — SPEC.md §4)

## `ScrapeRunSite`

One row per actual Trigger.dev site task — the fan-out unit from SPEC.md §7:
the cartesian product `sitesIncluded × jobConfigsIncluded` for an authenticated
run, `sitesIncluded` only for an anonymous one. Pre-created with
`outcome = 'pending'` by `POST /api/scrape/trigger`, in the same transaction as
the parent `ScrapeRun`, before any task is enqueued; each task then updates its
own row and calls the run-status rollup (SPEC.md §4). The rollup combines these
rows — `combineSiteOutcome` across a site's configs, then `combineRunStatus`
across sites — into `ScrapeRun.status`.

- `id` (`uuid`, `gen_random_uuid()`)
- `scrapeRunId` (`uuid`, FK → `scrape_run.id`, `onDelete: cascade`)
- `site` (`site` enum)
- `jobConfigId` (`uuid`, nullable — `null` for anonymous runs; FK → `job_config.id`, `onDelete: cascade`, so deleting a config drops its granular per-run trace while `ScrapeRun.status` — persisted independently — is unaffected)
- `outcome` (`scrape_run_site_outcome` enum: `pending` | `completed` | `empty_extraction` | `failed` | `skipped`; default `pending`)
- `failureCause` (`site_failure_cause` enum, nullable — set only when `outcome = 'failed'`: `markup_broken` / `bot_challenge` from the scrape itself, `timeout` from the stale-run watchdog for a task that died without reporting)
- `listingCount` (`integer`, default `0`)
- `updatedAt` (`timestamp`)
- Unique `(scrapeRunId, site, jobConfigId)`

## `Listing`

One row per scraped job posting, raw + normalized.

- `id`, `scrapeRunId`, `site`, `title`, `company`, `companyNormalized`, `roleCanonical`, `datePosted`, `salaryRaw`, `url`, `excludedByKeyword` (computed/cached — array of matched keyword strings, e.g. `["PHP", "Senior"]`; empty/null when not excluded), `duplicateOfListingId` (nullable, self-reference)

## `RateLimitCounter`

- `id`, `ipAddress`, `windowStart`, `count`

## Retention

Indefinite for all tables above, no automated purge — storage is cheap on self-hosted Postgres, and full history is what makes deduplication and "new since last run" views work at all.

## Relationships (summary)

```
User 1─N JobConfig
User 1─N ExclusionKeyword
User 1─N ScrapeRun (nullable — anonymous runs have no User at creation; may gain one later via claim, SPEC.md §3)
ScrapeRun 1─N Listing
ScrapeRun 1─N ScrapeRunSite (one row per (site, jobConfigId) task; jobConfigId nullable)
JobConfig 1─N ScrapeRunSite (nullable — null for anonymous runs)
Listing 0─1 Listing (self-reference, duplicateOfListingId)
```
