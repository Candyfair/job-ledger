# SPEC.md — Jobs Scraping behavioral specification

Living document. Update it whenever a design decision changes — this is the source of truth Claude Code should be pointed to for anything not covered by CLAUDE.md's high-level rules. For the persisted schema, see DATA_MODEL.md instead — that file is the reference for _what data exists_; this one is about _how the product behaves_.

## §1. User Roles

- **Anonymous visitor**: can trigger a scrape, choose between the two available models (Claude Haiku / DeepSeek V4 Flash), view the public dashboard. Nothing is persisted for them between visits — no saved job configs, no saved exclusions.
- **Authenticated user**: everything above, plus persisted job configs (each carrying its own excluded-keyword list) and settings-page access. Auth via Better Auth, OAuth-only (GitHub, Google) — chosen for auth-provider breadth relevant to a dev-tool audience reviewing the portfolio (GitHub in particular), and to avoid the transactional-email infrastructure (verification, password reset) that email/password would require. Accounts are automatically linked across providers by verified e-mail (accountLinking.trustedProviders: ["google", "github"]) — signing in with a different provider under the same verified e-mail attaches to the existing account rather than creating a duplicate.

Auth is scoped to persisting user config only — it never gates triggering a scrape or choosing a model. Fallback plan if cost abuse is ever detected on the public demo: default everyone to the cheapest model and add an auth requirement to trigger at all. Not implemented unless/until needed.

**Dashboard access is scoped the same way** (decided in Session 6, the dashboard's build session): an anonymous visitor reaches the dashboard only via the specific `?runId=` link returned right after triggering a scrape — a single-run view, with no history strip and no "all time" aggregate, since there is nothing to aggregate across for a visitor with no persisted `ScrapeRun` ownership. An authenticated user gets the full run-history strip (their own `ScrapeRun`s only) plus an "all time" listings view scoped to those same runs. See §3 and §6.

**Account identification & sign-out** (decided 2026-09-07): a persistent header component (§6) shows the authenticated user's avatar, email, and the OAuth provider(s) linked to their account (read from Better Auth's `account` table — see DATA_MODEL.md), plus a sign-out action. An anonymous visitor sees a sign-in/sign-up link in the same header instead.

**Claiming an anonymous run** (decided 2026-09-07): if a visitor signs up or signs in while a `runId` is in context (from `/dashboard?runId=`), that one `ScrapeRun` — not any broader history — is reattached to the account once auth completes (`userId` set from `NULL`). No `JobConfig` is created from it automatically; the search itself still has to be recreated manually on `/` afterward. No ownership verification beyond the row currently being unowned — a `runId` known to a third party could in principle be claimed by them instead of the original visitor. This risk is accepted given the non-sensitive nature of job-listing data. Full flow: §3.

## §2. Sites in Scope

Apec.fr and HelloWork. Apec's "partner sites" checkbox is deliberately left unchecked (overlaps with HelloWork, low relevance otherwise).

**Welcome to the Jungle was in scope initially but is now excluded.** Its job search became account-gated: results are produced by a personalized matching algorithm that needs a candidate profile (skills, experience, preferences), which recently replaced the previously-open keyword + location search. Company showcase pages and their individual open listings stay viewable without an account, but browsing companies one at a time is a fundamentally different access pattern than the deterministic keyword + location search this project's pipeline is built on (§4) — it offers no equivalent scraping surface. Separately, personalized match results aren't reproducible for a given `JobConfig` the way a plain search is, which conflicts with how JobConfig-driven runs are expected to behave. Standing up a dedicated dummy candidate account plus a different scraping approach for a single site wasn't worth it.

**LinkedIn and Indeed are excluded.** Both ToS explicitly prohibit automated/bot access to the site. For Indeed specifically: indeed.com/legal (Section A.3.5) confirms automating the Indeed Apply flow is prohibited, and independent sources report a broader site-wide scraping prohibition — consistent with the persistent Cloudflare blocking observed in Session 4 even after a genuine 15h cooldown, which pointed to deliberate enforcement rather than simple rate-limiting. Treated identically to LinkedIn: not worth the legal/reputational exposure on a recruiter-facing project. No further anti-detection engineering (stealth plugins, fingerprint spoofing) was attempted once the ToS signal was confirmed — that would cross from politeness into deliberate circumvention of a security measure enforcing a contractual prohibition.

## §3. User Flows

### Trigger a scrape & manage saved searches

**Route: `/`** (decided 2026-09-07 — merges the original separate `/trigger-scrape` and `/settings` routes into one; see §9 "Superseded decisions"). Content differs by auth state:

- **Anonymous**: the lightweight ad hoc form described below. Nothing persisted, no list to manage.
- **Authenticated**: the same trigger controls, plus full `JobConfig` CRUD inline on the same page — no separate settings screen. Existing `JobConfig` rows are listed (pre-checked, individually uncheckable), each editable and deletable in place. Below the list, an "Ajouter une nouvelle recherche" link expands an inline add form on the same page — same interaction pattern the former `/settings` page used, no navigation involved. This also resolves the earlier cold-start gap: a first-time authenticated user with zero `JobConfig` rows now lands directly on the page where they create one, instead of an empty trigger form pointing at a separate settings page.

1. User (anonymous or authenticated) opens `/` — directly, or redirected here (§6 has the exact redirect rules).
2. Form shows an unconditional intro reminder above it ("Lancez un scraping pour voir apparaître les offres ici." plus a second sentence that branches on auth state — anonymous: reminds them they'll get a direct results link with no account needed; authenticated: reminds them their searches/results stay tied to their account), then: lookback window selector (24h / 3 days / since a date), job configs (pre-checked, individually uncheckable, authenticated only — see above), sites (pre-checked, individually uncheckable — same "hybrid" pattern as job configs, chosen for consistency across both axes), model choice (Haiku / DeepSeek). For anonymous visitors, who have no persisted JobConfig rows, the job-config section is replaced by a one-off free-text search entered ad hoc for that run only — not saved: a job title (the search term, required), excluded keywords (optional), and a location (optional).
3. On submit: rate-limit check (per-IP counter in Postgres) → if within limits, create a `ScrapeRun` and trigger the corresponding Trigger.dev task(s), one per included site.
4. **Redirects immediately to `/dashboard`** (authenticated) or `/dashboard?runId=<id>` (anonymous) (decided 2026-09-07). Progress is then shown via the dashboard's status banner — see below.

### View dashboard & toggle exclusions

**Route: `/dashboard`** (decided 2026-09-07 — the dashboard previously rendered at `/`, which is now the merged trigger/settings page above; see §9 "Superseded decisions").

1. Dashboard lists `Listing` rows for the selected run (anonymous, via `?runId=`), a selected run from the user's own history (authenticated), or "all time" across the user's own runs (authenticated, no run selected). See §1 for the authenticated-vs-anonymous split.
2. Listings matching an exclusion keyword (title only — body text is out of scope for v1) are folded by default (collapsed, with a per-listing "reveal" link showing which keyword(s) matched). A global three-state control switches between Folded (default), Revealed (all excluded listings expanded), and Hidden (excluded listings removed from view entirely). Exact semantics (decided in Session 6, since the wording above was ambiguous about counts and the per-listing control):

   | Mode             | Excluded row visibility                                                           | Per-listing "reveal"                                                                  | Counts toward the toolbar's "N excluded"                                 |
   | ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
   | Folded (default) | Collapsed line: struck-through title/company + matched keyword(s), always visible | Present — expands just that row to the full column/card layout (still struck through) | Yes                                                                      |
   | Revealed         | Every excluded listing already shown at the full expanded layout                  | Not shown — nothing left for it to do                                                 | Yes                                                                      |
   | Hidden           | Not rendered at all                                                               | N/A                                                                                   | No — the summary describes what's currently shown, not a permanent total |

   This state is client-side UI only, never persisted (not even for authenticated users), and resets to Folded on reload.

3. Duplicate listings are grouped/flagged, not deleted. A duplicate group expands inline under its primary listing (no navigation).
4. Run-history strip (authenticated only) is clickable per entry to filter the listings below to that run; no entry selected shows the "all time" aggregate. (Currently broken — see §9.)
5. **Status banner** (decided 2026-09-07): shown at the top of the dashboard whenever the currently viewed run's status is `running`. Contains:
   - A visible "Recherche en cours..." message.
   - Pedagogical copy for first-time visitors — recruiters testing the portfolio in particular — explaining the deliberate scraping-politeness measures (§7) and why LinkedIn, Indeed, and Welcome to the Jungle are out of scope (§2, ToS grounds). Exact copy to be drafted at implementation time.
   - A collapse control. Collapsed state is stored in `localStorage` under the key `bannerCollapsed` (client-only, no server sync, same key for anonymous and authenticated visitors) and persists across visits and across runs — once collapsed, it stays collapsed for every future run until the user expands it again.
   - While collapsed and the run is still `running`: the banner reduces to a single line stating the search is still in progress.
   - Once the run resolves (`completed` or `partial_failure`) while the banner is collapsed: it stays collapsed, and the single line updates to a completion message. For `partial_failure`, this line names the affected site(s) and cause, reusing the per-site messages already defined in §5 verbatim (e.g. "Terminé — HelloWork indisponible (protection anti-bot)"), never the raw `partial_failure` status string. This depends on the run-status rollup (§4, §7) being reliable — shipping the banner ahead of the rollup would surface false "Terminé" states from the documented blind spot in the derived heuristic (§9), so the rollup ships first.
   - Polling (`GET /api/scrape/status/:runId`, §7) is now active for **both** anonymous and authenticated dashboard views whenever the displayed run's status is `running` — this extends the previous anonymous-only behavior. Same 4-second interval, same stop-on-resolution behavior.
6. A "Relancer une recherche" action, prominent on the dashboard at all times, links to `/`.

### Account menu

Persistent header component, present on `/` and `/dashboard` only — not on the auth pages (decided 2026-09-07):

- **Authenticated**: avatar (`User.image`), email, the OAuth provider(s) linked to the account (read from Better Auth's `account` table — see DATA_MODEL.md), and a "Se déconnecter" action.
- **Anonymous**: a "Se connecter / Créer un compte" link. If the visitor is currently on `/dashboard?runId=<id>`, this link carries that `runId` forward so signing up from the header can still trigger the claim flow below — it is not the only entry point into that flow (see next subsection).

### Create an account from an anonymous run

Two entry points into sign-up/sign-in for an anonymous visitor (decided 2026-09-07):

1. The header link above (generic, carries the current `runId` if any).
2. A contextual message on `/dashboard?runId=<id>` once that run has resolved (`completed` or `partial_failure`): "Créez un compte pour sauvegarder cette recherche."

Claim mechanism: if sign-up/sign-in completes while a `runId` was carried through either entry point, the corresponding `ScrapeRun` — that single run only — is reattached to the account: `userId` is set from `NULL` to the new user's id. This is idempotent — a run already attached to an account (its own or anyone else's) is never reassigned; a repeat or late claim attempt is simply a no-op. No `JobConfig` is created from the claimed run's ad hoc parameters — the saved search still has to be configured manually on `/` afterward. No verification confirms the claimant was the original visitor; this is an accepted risk given the low sensitivity of job-listing data.

## §4. Scraping & Extraction Pipeline

Per included site, per included `JobConfig`:

1. Playwright task navigates to the site's search results for that config's title (used verbatim as the search term) + location, within the lookback window. The config's `excludedKeywords` are **not** part of the query — they're applied after extraction (§5). Navigation/pagination is 100% deterministic code — see CLAUDE.md decision #1.
2. Random delay between page loads; limited concurrency per site (politeness — reduces block risk on sites with no formal API).
3. Raw page/listing content is captured.
4. Content is sent to the configured LLM adapter (Claude Haiku or DeepSeek V4 Flash — both wired behind one interface per CLAUDE.md decision #2) with a fixed extraction prompt/schema, returning structured JSON: title, company, date, salary, URL, plus a **normalized company name** and **canonical role signature** used for dedup (§5). See DATA_MODEL.md for the `Listing` shape these fields land in.
5. Extracted `Listing` rows are written to Postgres, tagged to the `ScrapeRun`.
6. **Run status rollup** (decided 2026-09-07 — supersedes the `await`-based proposal previously floated in §9): each site task, on completion (success or failure), recomputes and writes `ScrapeRun.status` from the current combined state of every site included in that run — the last site task to finish is the one whose write reflects the final state. This keeps `POST /api/scrape/trigger` (§7) non-blocking — no endpoint ever awaits site completion — while turning `ScrapeRun.status` into a real persisted fact instead of the derived-on-read heuristic in `lib/dashboard/derive-run-status.ts`. Implementation status: designed, not yet built — see §9.

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
   le site nécessite une vérification manuelle." These same per-site
   messages are reused verbatim in the dashboard's status banner for a
   resolved `partial_failure` run (§3).
3. That site is automatically set `active: false` globally until manually
   re-enabled — either cause affects the site for every user and every job
   config, not just the run that surfaced it. Any visitor, authenticated or
   not, sees the message for their run; only an authenticated user gets a
   persistent place (the settings page) to re-enable it.

## §6. Screens

- **Persistent header** (`/` and `/dashboard` only) — account menu; see §3 "Account menu."
- **`/` — trigger & saved-search management** (decided 2026-09-07, replaces the original separate trigger form and settings page — see §9 "Superseded decisions"). Authenticated: full `JobConfig` CRUD inline (title, excluded keywords, location per config) plus site/model selectors, all on one page. Anonymous: the lightweight ad hoc trigger form only. Full flow: §3.
- **`/dashboard`, authenticated** — run-history strip (own runs, newest first — currently broken, §9), listing table/cards for the selected run or "all time", exclusion toggle, duplicate grouping, status banner (§3), live polling while `running`.
- **`/dashboard`, anonymous** — single-run view via `?runId=`, no history strip, no aggregate; same listing table/cards, exclusion toggle, duplicate grouping, status banner (§3), live polling while `running`. No `runId` (or one that doesn't resolve — nonexistent, or belongs to someone else, treated identically so existence is never leaked) redirects to `/` instead of rendering anything at `/dashboard`. An authenticated user with zero `ScrapeRun`s is redirected from `/dashboard` to `/` the same way — there is nothing to show until they trigger one.
- **Auth pages** — sign in / sign up, GitHub and Google only (corrected 2026-09-07: this entry previously also listed "email+password," contradicting the OAuth-only decision already stated in §1 — a stale leftover, not a live design call, fixed here to match §1).

## §7. API Contracts & Non-Functional Requirements

### API (Next.js ↔ Trigger.dev)

- `POST /api/scrape/trigger` — creates the `ScrapeRun` row, invokes the per-site Trigger.dev task(s), returns `runId`. Authoritative `ScrapeRun` creation lives here: the endpoint creates the row once and passes its id into each site task, which then only appends `Listing` rows and never touches the run's `status` directly (the run-status rollup, §4, is written by the site tasks themselves as they complete). A site task invoked **without** a run id — Trigger.dev's Test tab, the `scripts/test-scrape-*` harnesses — falls back to creating its own single-site `ScrapeRun`; that path is a testing convenience, not the production flow.

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

  Fan-out: one Trigger.dev task per (site, resolved `JobConfig`) pair for authenticated requests — `sites.length × resolvedJobConfigIds.length` invocations, not one per site, since each `JobConfig` is its own search pass (§4). Anonymous requests get one task per site sharing the single `adHocSearch`. Task completion is never awaited — the endpoint returns `{ runId }` as soon as Trigger.dev acknowledges the enqueue. This remains true after the run-status rollup (§4): the rollup is written by the site tasks themselves as they complete, never by this endpoint waiting on them (decided 2026-09-07 — explicitly rules out the `await`-based approach previously floated in §9).

  Response: `{ runId: string }`, `201`.

- `GET /api/scrape/status/:runId` — polled by the frontend for in-app status, now active for both anonymous and authenticated dashboard views (§3). Ownership: an anonymous caller only sees `userId IS NULL` runs; an authenticated caller additionally sees their own runs — never a foreign authenticated user's run, and the two failure modes (nonexistent vs. not-yours) are indistinguishable (404 either way) so existence is never leaked.

  Response:

  ```
  {
    runId: string;
    status: "running" | "completed" | "partial_failure";
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

  **Status is a persisted fact, written by the run-status rollup** (decided 2026-09-07 — see §4 for the write mechanism, §9 for implementation status). Each site task updates `ScrapeRun.status` as it completes, so this endpoint reads a stored field instead of recomputing it on every request. Until the rollup ships, the endpoint still falls back to the derived heuristic (`lib/dashboard/derive-run-status.ts`, computed live from `Listing` rows + the global `SiteStatus` table) with its documented blind spots — see §9.

- `GET /api/scrape/runs` — authenticated-only, cursor-paginated "load more" for the dashboard's run-history strip (Session 6). 401 without a session.
- `GET /api/listings` — cursor-paginated "load more" for the dashboard's listings (Session 6). `?runId=` scopes to one run (ownership-checked identically to the status endpoint above); omitting it scopes to the caller's own "all time" aggregate (401 without a session in that case).
- **Claim endpoint** (decided 2026-09-07, not yet implemented — see §9): invoked as part of the sign-up/sign-in flow when a `runId` was carried through (§3). Functional contract: given a `runId` and the newly authenticated session, if `ScrapeRun.userId IS NULL`, set it to the session's user id; otherwise no-op. Exact mechanism — a dedicated endpoint vs. logic inline in the Better Auth callback handler, and how the `runId` survives the OAuth redirect round-trip — is left to the implementing session; flag it explicitly rather than guessing.
- Trigger.dev task → writes directly to Postgres on completion (no callback to Next.js needed); also writes the run-status rollup (§4).

**API (Settings — JobConfig CRUD, authenticated only)**

- `GET/POST /api/job-configs` — list / create
- `PATCH /api/job-configs/:id`, `DELETE /api/job-configs/:id`

  `POST` / `PATCH` accept `excludedKeywords?: string[]` (optional, defaults to `[]`).

  These routes are unchanged by the 2026-09-07 navigation redesign — only the page that calls them moved, from `/settings` to `/` (§3, §6).

### Non-functional

- **Rate limiting**: per-IP counters in Postgres (no dedicated service — see DEPLOYMENT.md), enforced on the trigger endpoint. Fixed one-hour window; threshold configurable via `TRIGGER_RATE_LIMIT_PER_HOUR` (default 5).
- **Volume cap**: 50 listings maximum per site (each `scrape-<site>` task caps its own output independently — not a shared total across a multi-site run).
- **Scraping politeness**: randomized inter-request delay between page fetches; limited per-site concurrency (each `scrape-<site>` Trigger.dev task pins `queue.concurrencyLimit: 1`, so runs against one site serialize while different sites still run in parallel); a stable mainstream desktop Chrome user-agent (not the literal Chromium default, whose headless build advertises `HeadlessChrome` — a bot signal on several of these boards; this is a plain request header, not stealth/fingerprint tooling, which §2 rules out).
- **Security**: see DEPLOYMENT.md for the full mTLS + fail2ban setup.
- **Client-side storage** (decided 2026-09-07): `bannerCollapsed` (boolean) in `localStorage`, same key for anonymous and authenticated visitors — see §3. No other client-side persistence exists; anonymous ad hoc search fields are not cached between visits.
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
- **Run status rollup**: two site tasks completing in either order produce the same final `ScrapeRun.status`; a run with every site `completed` yields `completed`; a run with at least one `failed` site yields `partial_failure`; `POST /api/scrape/trigger` returns before any site task completes (asserted via mock timing, not a race-condition test).
- **Anonymous run claim**: signing up with a valid, unclaimed `runId` in context reattaches that run; a second claim attempt against an already-claimed run is a no-op and does not reassign it; a `runId` belonging to a run someone else already claimed is still technically claimable by a third party who has the link — documented risk, not a bug to "fix" without a design discussion first.
- **Dashboard polling**: authenticated dashboard now polls while `status: "running"`, matching the anonymous behavior (regression test — this was anonymous-only before 2026-09-07).

## §9. Open Items — do not assume, ask before implementing

- Notification-on-completion — explicitly deferred to a possible v2, not v1.
- UI translation debt: auth pages (and, historically, the settings page before its 2026-09-07 merge into `/`) are currently in English, contradicting the French-UI decision (§7, non-functional). A dedicated full-UI translation pass is planned, sequenced after the navigation work above ships — so newly introduced text (banner, account menu, claim messaging) is translated in the same pass rather than twice.
- **Run status rollup — designed, not yet implemented** (target mechanism: §4, §7; decided 2026-09-07). Until built, `GET /api/scrape/status/:runId` keeps using the derived heuristic (`lib/dashboard/derive-run-status.ts`), with known blind spots: (1) a kill-switch skip on the shared fan-out path (`scrapeRunId` supplied) isn't visible anywhere this heuristic reads from; (2) a page whose LLM extraction came back empty with no Playwright error and no `SiteStatus` flip is a real `partial_failure` per §4/§5, but on the production multi-site fan-out path this heuristic reads from, nothing is persisted for that case, so such a run currently reads as `completed` (the single-site standalone path already tracks this correctly, in-memory only); (3) `SiteStatus` being a global singleton per site (not per-run) means attributing a failure to "this run" via a timestamp comparison can misattribute between two runs targeting the same site close together in time. The new mechanism (§4) resolves all three by writing a real persisted status per run; a kill-switch skip becomes one input among several the same way `markup_broken`/`bot_challenge` already are via `SiteStatus`. **Stopgap added 2026-09-07**: `trigger/finalize-stale-runs.ts` runs every ~10 min and force-resolves any run still `running` 15+ minutes after `triggeredAt` to `partial_failure` — it never inspects per-site outcomes, so it can't recover a run the full rollup would have marked `completed`, only prevents rows from staying `running` forever. Superseded once the rollup ships.
- Duplicate detection is not implemented: `lib/dedup/` (referenced by DATA_MODEL.md's `Listing.duplicateOfListingId`) was scoped to Session 5, never implemented — the dashboard's duplicate-group UI (Session 6) was built against the column via fixtures only, detection logic remains a dedicated open item.
- Dark mode: `app/globals.css`'s `@media (prefers-color-scheme: dark)` block and its `--background`/`--foreground` CSS variables are deliberate scaffolding for a real dark mode in v2 — not implemented yet. Every page currently sets an explicit light-mode Tailwind background (`bg-white`, `bg-zinc-50`, etc.) that never responds to that media query, so all text on every page now also carries an explicit light-mode color class (`text-zinc-900` and friends) rather than inheriting `var(--foreground)` — otherwise OS dark mode flips text to a light color against those same light backgrounds and makes it unreadable. When v2 dark mode is actually built, both the backgrounds and these explicit text colors need `dark:` variants added together, not just the variables re-enabled.

### Superseded decisions

- **Global `ExclusionKeyword` list (Sessions 1–5) → removed.** Exclusion keywords were originally a single per-account list (plus a `userId IS NULL` "global/anonymous" list), CRUD'd on the settings page, applied to every run regardless of the job it targeted. This was redundant with what `JobConfig.keywords` should always have been. Exclusion keywords are now **per `JobConfig`** (`JobConfig.excludedKeywords`) for authenticated runs and **per run** (`adHocSearch.excludedKeywords`) for anonymous ones — see §3, §4, §5. The `exclusion_keyword` table, the `/api/exclusion-keywords` routes, and the settings-page section are gone. The matching algorithm and alias table (`lib/filters/`) are unchanged — only the list's source moved.
- **Session 5's "anonymous exclusion list defaults to empty, no seeding, no fallback" is moot.** There is no global list for an anonymous run to fall back to or be seeded from; anonymous exclusion comes entirely from that run's own `adHocSearch.excludedKeywords` (which may be empty).
- **Separate `/trigger-scrape` and `/settings` routes (Sessions 1–6) → merged into a single `/` route (decided 2026-09-07).** The dashboard, previously rendered at `/`, moved to a dedicated `/dashboard` route; `/settings` now redirects to `/`. Rationale and full flow, plus the account-menu and claim-flow additions introduced alongside this merge: §1, §3, §6.
- **`await`-based run-status rollup, as floated in the original open item → superseded (2026-09-07).** Replaced by a rollup written by the individual site tasks as they complete, keeping `POST /api/scrape/trigger` non-blocking — see §4, §7.
