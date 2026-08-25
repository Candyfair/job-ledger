# DATA_MODEL.md — Jobs Scraping

Reference schema. Update when the real Prisma/Drizzle schema changes — this file should mirror it, not drift from it. Behavioral rules about _when_ these fields change (e.g. exclusion/duplicate logic) live in SPEC.md, not here.

## `User`

Managed by Better Auth (schema generated via `npx better-auth generate`, OAuth-only per SPEC.md §1). Also generates `session`, `account`, `verification` tables — not detailed here since app code never queries them directly. **Known gap**: `account` needs a hand-added `issuer` column (`text`, not null, unique together with `accountId`) — Better Auth 1.7's "account identity scoped by issuer" change, which neither `better-auth generate` nor `@better-auth/drizzle-adapter`'s codegen produce as of 1.7.1 (upstream gap, confirmed against their own 1-7-upgrade-guide). If a future `generate` run overwrites `drizzle/schema/auth.ts`, re-check whether upstream has caught up before dropping the manual column back in — see the comment in that file.

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

- `id`, `userId` (nullable), `triggeredAt`, `lookbackWindow`, `modelUsed`, `sitesIncluded`, `jobConfigsIncluded`, `status`

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
User 1─N ScrapeRun (nullable — anonymous runs have no User)
ScrapeRun 1─N Listing
Listing 0─1 Listing (self-reference, duplicateOfListingId)
```
