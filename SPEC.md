# SPEC.md — Jobs Scraping behavioral specification

Living document. Update it whenever a design decision changes — this is the source of truth Claude Code should be pointed to for anything not covered by CLAUDE.md's high-level rules. For the persisted schema, see DATA_MODEL.md instead — that file is the reference for _what data exists_; this one is about _how the product behaves_.

## §1. User Roles

- **Anonymous visitor**: can trigger a scrape, choose between the two available models (Claude Haiku / DeepSeek V4 Flash), view the public dashboard. Nothing is persisted for them between visits — no saved job configs, no saved exclusions.
- **Authenticated user**: everything above, plus persisted job configs (each carrying its own excluded-keyword list) and settings-page access. Auth via Better Auth, OAuth-only (GitHub, Google) — chosen for auth-provider breadth relevant to a dev-tool audience reviewing the portfolio (GitHub in particular), and to avoid the transactional-email infrastructure (verification, password reset) that email/password would require. Accounts are automatically linked across providers by verified e-mail (accountLinking.trustedProviders: ["google", "github"]) — signing in with a different provider under the same verified e-mail attaches to the existing account rather than creating a duplicate.

Auth is scoped to persisting user config only — it never gates triggering a scrape or choosing a model. Fallback plan if cost abuse is ever detected on the public demo: default everyone to the cheapest model and add an auth requirement to trigger at all. Not implemented unless/until needed.

**Dashboard access is scoped the same way** (decided in Session 6, the dashboard's build session): an anonymous visitor reaches the dashboard only via the specific `?runId=` link returned right after triggering a scrape — a single-run view, with no history strip and no "all time" aggregate, since there is nothing to aggregate across for a visitor with no persisted `ScrapeRun` ownership. An authenticated user gets the full run-history strip (their own `ScrapeRun`s only) plus an "all time" listings view scoped to those same runs. See §3 and §6.

## §2. Sites in Scope

Apec.fr and HelloWork. Apec's "partner sites" checkbox is deliberately left unchecked (overlaps with HelloWork, low relevance otherwise).

**Welcome to the Jungle was in scope initially but is now excluded.** Its job search became account-gated: results are produced by a personalized matching algorithm that needs a candidate profile (skills, experience, preferences), which recently replaced the previously-open keyword + location search. Company showcase pages and their individual open listings stay viewable without an account, but browsing companies one at a time is a fundamentally different access pattern than the deterministic keyword + location search this project's pipeline is built on (§4) — it offers no equivalent scraping surface. Separately, personalized match results aren't reproducible for a given `JobConfig` the way a plain search is, which conflicts with how JobConfig-driven runs are expected to behave. Standing up a dedicated dummy candidate account plus a different scraping approach for a single site wasn't worth it.

**LinkedIn and Indeed are excluded.** Both ToS explicitly prohibit automated/bot access to the site. For Indeed specifically: indeed.com/legal (Section A.3.5) confirms automating the Indeed Apply flow is prohibited, and independent sources report a broader site-wide scraping prohibition — consistent with the persistent Cloudflare blocking observed in Session 4 even after a genuine 15h cooldown, which pointed to deliberate enforcement rather than simple rate-limiting. Treated identically to LinkedIn: not worth the legal/reputational exposure on a recruiter-facing project. No further anti-detection engineering (stealth plugins, fingerprint spoofing) was attempted once the ToS signal was confirmed — that would cross from politeness into deliberate circumvention of a security measure enforcing a contractual prohibition.

## §3. User Flows

### Trigger a scrape

1. User (anonymous or authenticated) opens the trigger form — directly, or redirected here from `/` when there is nothing to show: anonymous with no `?runId=` (or one that doesn't resolve), or authenticated with zero `ScrapeRun`s yet (§6).
2. Form shows an unconditional intro reminder above it ("Lancez un scraping pour voir apparaître les offres ici." plus a second sentence that branches on auth state — anonymous: reminds them they'll get a direct results link with no account needed; authenticated: reminds them their searches/results stay tied to their account), then: lookback window selector (24h / 3 days / since a date), job configs (pre-checked, individually uncheckable), sites (pre-checked, individually uncheckable — same "hybrid" pattern as job configs, chosen for consistency across both axes), model choice (Haiku / DeepSeek). For anonymous visitors, who have no persisted JobConfig rows, the job-config section is replaced by a one-off free-text search entered ad hoc for that run only — not saved: a job title (the search term, required), excluded keywords (optional), and a location (optional).
3. On submit: rate-limit check (per-IP counter in Postgres) → if within limits, create a `ScrapeRun` and trigger the corresponding Trigger.dev task(s), one per included site.
4. In-app status indicator shows progress (running / completed / partial failure). No email/push notification for v1 — deliberately deferred, see §9.

### Configure job postings & exclusions (authenticated only)

1. Settings page, separate from the dashboard — keeps the dashboard focused on consumption, not editing.
2. CRUD for `JobConfig` (title, excluded keywords, location).

### View dashboard & toggle exclusions

1. Dashboard lists `Listing` rows for the selected run (anonymous, via `?runId=`), a selected run from the user's own history (authenticated), or "all time" across the user's own runs (authenticated, no run selected). See §1 for the authenticated-vs-anonymous split.
2. Listings matching an exclusion keyword (title only — body text is out of scope for v1) are folded by default (collapsed, with a per-listing "reveal" link showing which keyword(s) matched). A global three-state control switches between Folded (default), Revealed (all excluded listings expanded), and Hidden (excluded listings removed from view entirely). Exact semantics (decided in Session 6, since the wording above was ambiguous about counts and the per-listing control):

   | Mode             | Excluded row visibility                                                           | Per-listing "reveal"                                                                  | Counts toward the toolbar's "N excluded"                                 |
   | ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
   | Folded (default) | Collapsed line: struck-through title/company + matched keyword(s), always visible | Present — expands just that row to the full column/card layout (still struck through) | Yes                                                                      |
   | Revealed         | Every excluded listing already shown at the full expanded layout                  | Not shown — nothing left for it to do                                                 | Yes                                                                      |
   | Hidden           | Not rendered at all                                                               | N/A                                                                                   | No — the summary describes what's currently shown, not a permanent total |

   This state is client-side UI only, never persisted (not even for authenticated users), and resets to Folded on reload.

3. Duplicate listings are grouped/flagged, not deleted. A duplicate group expands inline under its primary listing (no navigation).
4. Run-history strip (authenticated only) is clickable per entry to filter the listings below to that run; no entry selected shows the "all time" aggregate. The anonymous single-run view polls `GET /api/scrape/status/:runId` (§7) every 4 seconds while that run's status is `running`, and stops once it resolves — 4s is a deliberate midpoint of a 3–5s target, not load-bearing precision.

## §4. Scraping & Extraction Pipeline

Per included site, per included `JobConfig`:

1. Playwright task navigates to the site's search results for that config's title (used verbatim as the search term) + location, within the lookback window. The config's `excludedKeywords` are **not** part of the query — they're applied after extraction (§5). Navigation/pagination is 100% deterministic code — see CLAUDE.md decision #1.
2. Random delay between page loads; limited concurrency per site (politeness — reduces block risk on sites with no formal API).
3. Raw page/listing content is captured.
4. Content is sent to the configured LLM adapter (Claude Haiku or DeepSeek V4 Flash — both wired behind one interface per CLAUDE.md decision #2) with a fixed extraction prompt/schema, returning structured JSON: title, company, date, salary, URL, plus a **normalized company name** and **canonical role signature** used for dedup (§5). See DATA_MODEL.md for the `Listing` shape these fields land in.
5. Extracted `Listing` rows are written to Postgres, tagged to the `ScrapeRun`.

**Why two models, chosen at request time, including for anonymous visitors**: keeps cost exposure on the public demo bounded regardless of traffic (both are cheap; DeepSeek Flash is cheaper still off-peak), while giving authenticated users a real choice. Guardrails regardless of model: per-IP rate limiting (§7), per-run volume cap (§7), Anthropic Console spend limit (manual, see DEPLOYMENT.md), kill switch env var. Fallback if abuse is detected anyway: default to the cheapest model + require auth to trigger (see §1).

### Extraction details (decided in Session 3, Indeed + Claude Haiku)

- Raw content from a results page is captured as a single batch — Claude receives every listing on that page in one call and returns a structured array, not one call per listing.
- `title` is the only required field on extraction output. Every other structured field (`company`, `companyNormalized`, `roleCanonical`, `datePosted`, `salaryRaw`) is nullable — a listing with no visible salary, an anonymous employer, or other missing details is still kept, never dropped for that reason alone.
- `url` is **not** produced by the LLM. Playwright captures each listing's `href` directly from the DOM and tags it with a local `listingId`; Claude receives and echoes back that same `listingId` for each extracted entry, and code re-attaches the real URL afterward by matching on that id.
- Lookback window filtering stays deterministic code after extraction, never an LLM decision (CLAUDE.md decision #1). A listing with no usable date signal at all (not even a relative one) is excluded from that run — code does not guess whether it fits the requested window.
- Partial extraction failure: if one entry in a batch fails schema validation (malformed JSON for that entry, missing title), that entry is dropped alone (logged as a warning) — never the whole batch. A Playwright-level failure (selector not found) remains a site-wide failure, handled as already specified above (`SiteStatus`).

## §5. Filtering & Deduplication

Both of the following are deterministic code, never an LLM judgment call — the LLM's job stops at producing the normalized fields consumed here (CLAUDE.md decision #1):

- **Exclusion filtering**: a listing's title is checked against the exclusion
  keywords for the search that produced it — `JobConfig.excludedKeywords` for
  an authenticated run, `adHocSearch.excludedKeywords` for an anonymous one
  (both may be empty, in which case nothing is flagged) — using whole-word
  matching, case-insensitive and
  diacritic-insensitive (accents stripped before comparison). The title is
  tokenized on whitespace and punctuation, except that `- / + # . _` are
  treated as internal token characters (not separators) so compound tech
  terms stay intact (e.g. `Full-Stack`, `React/Node`, `C++`, `Node.js` are
  each a single token). A single-word keyword matches an exact token; a
  multi-word keyword (e.g. `chef de projet`) matches only as a contiguous,
  in-order phrase within the title's token sequence. No stemming/
  pluralization in v1 (`Senior` won't match `Seniors`) — revisit if this
  proves too strict in practice. Match → flagged, not deleted (§3).
- **Duplicate detection**: listings are compared on `companyNormalized` + `roleCanonical` (both produced by Claude at extraction, §4) using exact/near-exact matching in code. A match sets `duplicateOfListingId`. Two listings where both fields are `null` must never be treated as duplicates of each other, even though their comparison keys are technically equal (null == null) — flagged here for Session 5's implementation, nothing to implement yet.

Before tokenization, both the title and the keyword pass through a
normalization step for known spelling variants (e.g. `full-stack` /
`full stack` / `fullstack` → `fullstack`), defined in
`lib/filters/keyword-aliases.ts`. The list is deliberately narrow at
launch — extended incrementally as new cases surface, not an attempt at
exhaustive coverage.

### Error handling — site scrape failure

1. A site's Playwright task fails. Two distinct causes, recorded separately on
   `SiteStatus.lastFailureCause` (see DATA_MODEL.md):
   - **`markup_broken`** — a selector timed out / an expected element wasn't
     found / the results structure no longer matches. The site likely
     changed its markup.
   - **`bot_challenge`** — the site served a recognized bot-verification
     interstitial (Cloudflare-style challenge page) instead of results.
     Detection is a conservative substring match against known challenge-page
     copy; it is never worked around (SPEC.md §2 — circumventing a
     bot-protection measure crosses from politeness into deliberate evasion).
     A page's LLM extraction coming back empty is **not** in this category —
     that's a per-run `partial_failure`, not a site deactivation.
2. That site's portion of the run is marked failed; the user sees an
   informational message keyed to the cause — markup: "Impossible de
   récupérer les résultats de [site] — le site a peut-être changé et doit
   être vérifié."; bot block: "Accès à [site] bloqué (protection anti-bot) —
   le site nécessite une vérification manuelle."
3. That site is automatically set `active: false` globally until manually
   re-enabled — either cause affects the site for every user and every job
   config, not just the run that surfaced it. Any visitor, authenticated or
   not, sees the message for their run; only an authenticated user gets a
   persistent place (the settings page) to re-enable it.

## §6. Screens

- **Trigger form** (modal or dedicated page) — window, job configs, sites, model choice.
- **Dashboard, authenticated** — run-history strip (own runs, newest first), listing table/cards for the selected run or "all time", exclusion toggle, duplicate grouping.
- **Dashboard, anonymous** — single-run view via `?runId=`, no history strip, no aggregate; same listing table/cards, exclusion toggle, duplicate grouping, plus live status polling while the run is `running`. No `runId` (or one that doesn't resolve — nonexistent, or belongs to someone else, treated identically so existence is never leaked) redirects to the trigger form instead of rendering anything at `/`. An authenticated user with zero `ScrapeRun`s redirects the same way — there is nothing to show until they trigger one.
- **Settings page** — job config CRUD (title, excluded keywords, location per config).
- **Auth pages** — sign in / sign up (email+password, GitHub, Google).

## §7. API Contracts & Non-Functional Requirements

### API (Next.js ↔ Trigger.dev)

- `POST /api/scrape/trigger` — creates the `ScrapeRun` row, invokes the per-site Trigger.dev task(s), returns `runId`. Authoritative `ScrapeRun` creation lives here: the endpoint creates the row once and passes its id into each site task, which then only appends `Listing` rows and never touches the run's `status` (the endpoint rolls per-site outcomes up). A site task invoked **without** a run id — Trigger.dev's Test tab, the `scripts/test-scrape-*` harnesses — falls back to creating its own single-site `ScrapeRun`; that path is a testing convenience, not the production flow.

  Request body:

  ```
  {
    lookbackWindow: '24h' | '3d' | { since: string }; // ISO 8601 date
    sites: SiteId[];
    model: string;              // "claude_haiku" or "deepseek_v4_flash" —
                                 // both have a real adapter and are accepted;
                                 // an allowlist still gates this rather than
                                 // trusting the persisted enum directly, so a
                                 // model reserved on the enum ahead of its
                                 // adapter being wired gets a clear 400 here
                                 // instead of a Trigger.dev task failing
                                 // mid-run (adapter pattern: CLAUDE.md
                                 // decision #2)
    jobConfigIds?: string[];    // authenticated users only
    adHocSearch?: {             // anonymous users only, never persisted
      title: string;            // the search term (required, non-blank)
      excludedKeywords?: string[];  // optional; defaults to []
      location?: string;
    };
  }
  ```

  Auth branching: a session present requires a non-empty `jobConfigIds` (400 otherwise) and ignores `adHocSearch` if present; no session requires `adHocSearch` with a non-blank `title` (400 otherwise — `excludedKeywords` and `location` are optional) and ignores `jobConfigIds` if present. `jobConfigIds` are scoped to the caller's own rows — ids that don't belong to the caller (or don't exist) are silently dropped rather than individually rejected; only a fully-empty resolution (none of the supplied ids belong to the caller) is a 400.

  Rate limiting (see below) is checked before any write — a rejected request (429) never creates a `ScrapeRun`.

  Fan-out: one Trigger.dev task per (site, resolved `JobConfig`) pair for authenticated requests — `sites.length × resolvedJobConfigIds.length` invocations, not one per site, since each `JobConfig` is its own search pass (§4). Anonymous requests get one task per site sharing the single `adHocSearch`. Task completion is never awaited — the endpoint returns `{ runId }` as soon as Trigger.dev acknowledges the enqueue.

  Response: `{ runId: string }`, `201`.

- `GET /api/scrape/status/:runId` — polled by the frontend for in-app status (Session 6). Ownership: an anonymous caller only sees `userId IS NULL` runs; an authenticated caller additionally sees their own runs — never a foreign authenticated user's run, and the two failure modes (nonexistent vs. not-yours) are indistinguishable (404 either way) so existence is never leaked.

  Response:

  ```
  {
    runId: string;
    status: "running" | "completed" | "partial_failure";
    statusBasis: "derived";   // see the note below — not a stored fact
    triggeredAt: string;      // ISO 8601
    model: string;
    sites: {
      site: SiteId; label: string; code: string;
      status: "pending" | "completed" | "failed";
      failureCause: "markup_broken" | "bot_challenge" | null;
      listingCount: number;
    }[];
    kept: number;
    excluded: number;
    duplicateGroups: number;
  }
  ```

  **`statusBasis: "derived"` is load-bearing, not decorative.** No code path anywhere writes `ScrapeRun.status` past its `"running"` default — see the existing kill-switch note below, which already anticipated this gap. This endpoint instead computes status live from `Listing` rows + the global `SiteStatus` table (`lib/dashboard/derive-run-status.ts`), with the same known blind spots documented there.

- `GET /api/scrape/runs` — authenticated-only, cursor-paginated "load more" for the dashboard's run-history strip (Session 6). 401 without a session.
- `GET /api/listings` — cursor-paginated "load more" for the dashboard's listings (Session 6). `?runId=` scopes to one run (ownership-checked identically to the status endpoint above); omitting it scopes to the caller's own "all time" aggregate (401 without a session in that case).
- Trigger.dev task → writes directly to Postgres on completion (no callback to Next.js needed).

**API (Settings — JobConfig CRUD, authenticated only)**

- `GET/POST /api/job-configs` — list / create
- `PATCH /api/job-configs/:id`, `DELETE /api/job-configs/:id`

  `POST` / `PATCH` accept `excludedKeywords?: string[]` (optional, defaults to `[]`).

### Non-functional

- **Rate limiting**: per-IP counters in Postgres (no dedicated service — see DEPLOYMENT.md), enforced on the trigger endpoint. Fixed one-hour window; threshold configurable via `TRIGGER_RATE_LIMIT_PER_HOUR` (default 5).
- **Volume cap**: 50 listings maximum per site (each `scrape-<site>` task caps its own output independently — not a shared total across a multi-site run).
- **Scraping politeness**: randomized inter-request delay between page fetches; limited per-site concurrency (each `scrape-<site>` Trigger.dev task pins `queue.concurrencyLimit: 1`, so runs against one site serialize while different sites still run in parallel); a stable mainstream desktop Chrome user-agent (not the literal Chromium default, whose headless build advertises `HeadlessChrome` — a bot signal on several of these boards; this is a plain request header, not stealth/fingerprint tooling, which §2 rules out).
- **Security**: see DEPLOYMENT.md for the full mTLS + fail2ban setup.
- **UI language**: French throughout.
- **License**: MIT.

## §8. Testing Scenarios

Concrete cases to cover once each piece is built (see CLAUDE.md's Testing section for tooling/conventions):

- **Exclusion filtering**:
  - Whole-word match: keyword `PHP` flags `Développeur PHP`.
  - Connector characters stay attached: keyword `Stack` does NOT flag
    `Full-Stack Developer` (hyphen keeps it one token); keyword `C++` DOES
    flag a title containing `C++` as its own token.
  - Multi-word phrase match: keyword `chef de projet` flags
    `Chef de Projet Digital` but not the same three words out of order or
    non-contiguous.
  - Accent-insensitive: keyword `developpeur` (no accent) flags
    `Développeur .NET`.
  - Case-insensitive: keyword `senior` flags `Senior Backend Engineer`.
- **Duplicate detection**: two listings with identical `companyNormalized`+`roleCanonical` but different raw titles/sites are linked; two genuinely different roles at the same company are not.
- **Rate limiting**: requests under the per-IP threshold succeed; requests over it are rejected with a clear error, and the counter resets after its window.
- **Extraction adapter**: both Haiku and DeepSeek adapters return the same JSON shape for the same fixture input (contract test, mocked responses — never live calls in CI).
- **Trigger form**: all job configs/sites pre-checked by default; unchecking one excludes it from the submitted payload.
- **Error handling**: a simulated selector failure and a simulated bot-challenge page each flip the site's `active` flag, record the matching `lastFailureCause` (`markup_broken` / `bot_challenge`), and surface the cause-specific message; an empty extraction result does neither (it downgrades the run to `partial_failure`).

## §9. Open Items — do not assume, ask before implementing

- Notification-on-completion — explicitly deferred to a possible v2, not v1.
- UI translation debt: auth pages and settings page (built in Session 2) are currently in English, contradicting the Session 1 French decision. Needs a dedicated pass — not scheduled yet, not in scope for Session 3.
- Kill-switch visibility on shared runs: when a task is skipped by the kill switch on the shared fan-out path (`scrapeRunId` supplied), the skip is only visible in Trigger.dev task logs, not in `ScrapeRun.status` or the dashboard — no rollup mechanism yet reconciles per-site outcomes into a run's final status. `GET /api/scrape/status/:runId` (§7) is now built (Session 6), but as a live-derived heuristic (`lib/dashboard/derive-run-status.ts`), not a real rollup writer — the underlying gap this bullet describes is still open, just worked around rather than solved. Known consequences of the derived approach: (1) a kill-switch skip still isn't visible anywhere this heuristic reads from; (2) a page whose LLM extraction came back empty with no Playwright error and no `SiteStatus` flip is a real `partial_failure` per §4/§5, but that signal is only recorded in-memory on the single-site standalone scrape path — the production multi-site fan-out path this heuristic reads from has nothing persisted for it, so such a run reads as "completed"; (3) `SiteStatus` being a global singleton per site (not per-run) means attributing a failure to "this run" via a timestamp comparison can misattribute between two runs targeting the same site close together in time. When a real rollup is designed — e.g. `POST /api/scrape/trigger` awaiting per-site completion and writing `ScrapeRun.status` exactly once — it should treat a kill-switch skip as one input among several, the same way `markup_broken`/`bot_challenge` already are via `SiteStatus`, rather than writing directly to the shared `ScrapeRun` row. Deliberately out of scope for Session 6 (the dashboard build) since it touches the Tier-1 `/trigger` fan-out and the "never awaited" completion contract documented on `POST /api/scrape/trigger` itself.
- Duplicate detection is not implemented: `lib/dedup/` (referenced by DATA_MODEL.md's `Listing.duplicateOfListingId`) was scoped to Session 5, never implemented — the dashboard's duplicate-group UI (Session 6) was built against the column via fixtures only, detection logic remains a dedicated open item.
- Dark mode: `app/globals.css`'s `@media (prefers-color-scheme: dark)` block and its `--background`/`--foreground` CSS variables are deliberate scaffolding for a real dark mode in v2 — not implemented yet. Every page currently sets an explicit light-mode Tailwind background (`bg-white`, `bg-zinc-50`, etc.) that never responds to that media query, so all text on every page now also carries an explicit light-mode color class (`text-zinc-900` and friends) rather than inheriting `var(--foreground)` — otherwise OS dark mode flips text to a light color against those same light backgrounds and makes it unreadable. When v2 dark mode is actually built, both the backgrounds and these explicit text colors need `dark:` variants added together, not just the variables re-enabled.

### Superseded decisions

- **Global `ExclusionKeyword` list (Sessions 1–5) → removed.** Exclusion keywords were originally a single per-account list (plus a `userId IS NULL` "global/anonymous" list), CRUD'd on the settings page, applied to every run regardless of the job it targeted. This was redundant with what `JobConfig.keywords` should always have been. Exclusion keywords are now **per `JobConfig`** (`JobConfig.excludedKeywords`) for authenticated runs and **per run** (`adHocSearch.excludedKeywords`) for anonymous ones — see §3, §4, §5. The `exclusion_keyword` table, the `/api/exclusion-keywords` routes, and the settings-page section are gone. The matching algorithm and alias table (`lib/filters/`) are unchanged — only the list's source moved.
- **Session 5's "anonymous exclusion list defaults to empty, no seeding, no fallback" is moot.** There is no global list for an anonymous run to fall back to or be seeded from; anonymous exclusion comes entirely from that run's own `adHocSearch.excludedKeywords` (which may be empty).
