# SPEC.md — Jobs Scraping behavioral specification

Living document. Update it whenever a design decision changes — this is the source of truth Claude Code should be pointed to for anything not covered by CLAUDE.md's high-level rules. For the persisted schema, see DATA_MODEL.md instead — that file is the reference for _what data exists_; this one is about _how the product behaves_.

## §1. User Roles

- **Anonymous visitor**: can trigger a scrape, choose between the two available models (Claude Haiku / DeepSeek V4 Flash), view the public dashboard. Nothing is persisted for them between visits — no saved job configs, no saved exclusions.
- **Authenticated user**: everything above, plus persisted job configs, persisted global exclusion keyword list, and settings-page access. Auth via Better Auth, OAuth-only (GitHub, Google) — chosen for auth-provider breadth relevant to a dev-tool audience reviewing the portfolio (GitHub in particular), and to avoid the transactional-email infrastructure (verification, password reset) that email/password would require. Accounts are automatically linked across providers by verified e-mail (accountLinking.trustedProviders: ["google", "github"]) — signing in with a different provider under the same verified e-mail attaches to the existing account rather than creating a duplicate.

Auth is scoped to persisting user config only — it never gates triggering a scrape or choosing a model. Fallback plan if cost abuse is ever detected on the public demo: default everyone to the cheapest model and add an auth requirement to trigger at all. Not implemented unless/until needed.

## §2. Sites in Scope

Welcome to the Jungle, Apec.fr, HelloWork. Apec's "partner sites" checkbox is deliberately left unchecked (overlaps with HelloWork, low relevance otherwise).

**LinkedIn and Indeed are excluded.** Both ToS explicitly prohibit automated/bot access to the site. For Indeed specifically: indeed.com/legal (Section A.3.5) confirms automating the Indeed Apply flow is prohibited, and independent sources report a broader site-wide scraping prohibition — consistent with the persistent Cloudflare blocking observed in Session 4 even after a genuine 15h cooldown, which pointed to deliberate enforcement rather than simple rate-limiting. Treated identically to LinkedIn: not worth the legal/reputational exposure on a recruiter-facing project. No further anti-detection engineering (stealth plugins, fingerprint spoofing) was attempted once the ToS signal was confirmed — that would cross from politeness into deliberate circumvention of a security measure enforcing a contractual prohibition.

## §3. User Flows

### Trigger a scrape

1. User (anonymous or authenticated) opens the trigger form.
2. Form shows: lookback window selector (24h / 3 days / since a date), job configs (pre-checked, individually uncheckable), sites (pre-checked, individually uncheckable — same "hybrid" pattern as job configs, chosen for consistency across both axes), model choice (Haiku / DeepSeek). For anonymous visitors, who have no persisted JobConfig rows, the job-config section is replaced by a one-off free-text search (job title, keywords, location) entered ad hoc for that run only — not saved.
3. On submit: rate-limit check (per-IP counter in Postgres) → if within limits, create a `ScrapeRun` and trigger the corresponding Trigger.dev task(s), one per included site.
4. In-app status indicator shows progress (running / completed / partial failure). No email/push notification for v1 — deliberately deferred, see §9.

### Configure job postings & exclusions (authenticated only)

1. Settings page, separate from the dashboard — keeps the dashboard focused on consumption, not editing.
2. CRUD for `JobConfig` (title, keywords, location).
3. CRUD for the global `ExclusionKeyword` list.

### View dashboard & toggle exclusions

1. Dashboard lists `Listing` rows for the selected run(s) (or "all time").
2. Listings matching an exclusion keyword (title only — body text is out of scope for v1) are folded by default (collapsed, with a per-listing "reveal" link showing which keyword(s) matched). A global three-state control switches between Folded (default), Revealed (all excluded listings expanded), and Hidden (excluded listings removed from view entirely).
3. Duplicate listings are grouped/flagged, not deleted.

## §4. Scraping & Extraction Pipeline

Per included site, per included `JobConfig`:

1. Playwright task navigates to the site's search results for that config's keywords + location, within the lookback window. Navigation/pagination is 100% deterministic code — see CLAUDE.md decision #1.
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

- **Exclusion filtering**: a listing's title is checked against the global
  `ExclusionKeyword` list using whole-word matching, case-insensitive and
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

### Error handling — broken site markup

1. A site's Playwright task fails (selector timeout / element not found).
2. That site's portion of the run is marked failed; user sees an informational message ("Could not fetch results from [site] — it may have changed and needs review").
3. That site is automatically set `active: false` globally (see DATA_MODEL.md's `SiteStatus`) until manually re-enabled — a markup break affects the site for every user and every job config, not just the run that surfaced it. Any visitor, authenticated or not, sees the "needs review" message for their run; only an authenticated user gets a persistent place (the settings page) to re-enable it.

## §6. Screens

- **Trigger form** (modal or dedicated page) — window, job configs, sites, model choice.
- **Dashboard** — listing table/cards, exclusion toggle, duplicate grouping, run status.
- **Settings page** — job config CRUD, exclusion keyword CRUD.
- **Auth pages** — sign in / sign up (email+password, GitHub, Google).

## §7. API Contracts & Non-Functional Requirements

### API (Next.js ↔ Trigger.dev)

To be detailed in the scaffolding session once the extraction schema is finalized. Expected shape:

- `POST /api/scrape/trigger` — body: `{ lookbackWindow, jobConfigIds[], sites[], model }` → creates `ScrapeRun`, invokes Trigger.dev task(s), returns `runId`.
- `GET /api/scrape/status/:runId` — polled by the frontend for in-app status.
- Trigger.dev task → writes directly to Postgres on completion (no callback to Next.js needed).

**API (Settings — JobConfig & ExclusionKeyword CRUD, authenticated only)**

- `GET/POST /api/job-configs` — list / create
- `PATCH /api/job-configs/:id`, `DELETE /api/job-configs/:id`
- `GET/POST /api/exclusion-keywords` — list / create
- `DELETE /api/exclusion-keywords/:id`

### Non-functional

- **Rate limiting**: per-IP counters in Postgres (no dedicated service — see DEPLOYMENT.md), enforced on the trigger endpoint.
- **Volume cap**: 50 listings maximum par run.
- **Scraping politeness**: randomized inter-request delay, limited per-site concurrency, default Chromium user-agent.
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
- **Error handling**: a simulated Playwright failure for one site produces the info message and, for an authenticated user, flips that site's `active` flag.

## §9. Open Items — do not assume, ask before implementing

- Notification-on-completion — explicitly deferred to a possible v2, not v1.
- UI translation debt: auth pages and settings page (built in Session 2) are currently in English, contradicting the Session 1 French decision. Needs a dedicated pass — not scheduled yet, not in scope for Session 3.
