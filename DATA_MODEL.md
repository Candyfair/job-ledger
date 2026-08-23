# DATA_MODEL.md — Jobs Scraping

Reference schema. Update when the real Prisma/Drizzle schema changes — this file should mirror it, not drift from it. Behavioral rules about _when_ these fields change (e.g. exclusion/duplicate logic) live in SPEC.md, not here.

## `User`

Managed by Better Auth. Standard fields (id, email, name, provider) plus the relations below.

## `JobConfig`

One row per configured job search.

- `id`
- `userId` (nullable — anonymous runs don't create one)
- `title` (e.g. "React front-end")
- `keywords` (e.g. `["React"]`, or `["React Native", "mobile"]` — this defines a _search pass_; "React" and "React Native/mobile" are two separate `JobConfig` rows, not one combined search, since combining keywords dilutes results on most of these sites' search UIs)
- `location` (geographic zone — **per config, not global**, so the tool stays generic for other installers with different searches)

## `SiteStatus`

Global per-site availability — a markup break affects that site's scraper for every search running against it, not one job config in isolation. One row per supported site, shared across all users (including anonymous).

- `site` (Welcome to the Jungle / Indeed / Apec.fr / HelloWork)
- `active` (boolean, default `true`; auto-set to `false` when that site's Playwright task fails — see SPEC.md §5)
- `lastErrorAt`, `lastErrorNote` (optional, feeds the "needs review" message)

## `ExclusionKeyword`

Global list, shared across all `JobConfig` rows for a given user (or global/anonymous for unauthenticated runs) — deliberately not per-config, since the added complexity wasn't worth it for marginal precision gain.

- `id`, `userId` (nullable), `keyword`

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
