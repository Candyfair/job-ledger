# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project overview

Jobs Scraping — an open-source, on-demand job-listing aggregator across French job boards (Welcome to the Jungle, Indeed, Apec.fr, HelloWork), built to demonstrate agentic development with the Claude API. Playwright handles navigation deterministically; Claude (or DeepSeek V4 Flash, offered as an alternative) only structures raw listing content into normalized JSON. Results are deduplicated and filterable in a dashboard.

Full behavioral spec: see `SPEC.md`. Deployment/infra runbook: see `DEPLOYMENT.md`.

## Tech stack

- Next.js (App Router) + TypeScript, hosted on Vercel
- Trigger.dev — background scraping jobs, native Playwright build extension (no separate browser-hosting service)
- Playwright — deterministic navigation/pagination only, never agent-controlled
- Claude API (Haiku) and DeepSeek V4 Flash — both available behind a shared adapter interface (`/lib/extraction`)
- Postgres, self-hosted in Docker on an existing VPS — see DEPLOYMENT.md
- Drizzle — chosen over Prisma for serverless fit (no bundled query engine binary, smaller bundle, no cold-start overhead on Vercel/Trigger.dev)
- Better Auth — email/password, GitHub, Google
- Vitest + React Testing Library — unit/component tests; Playwright doubles as the e2e runner for critical flows (already in the stack for scraping)

## Key architectural decisions — do not deviate without checking SPEC.md

1. **Claude structures, code decides.** Claude's only role anywhere in this codebase is turning ambiguous raw content into structured JSON (listing extraction, cross-site normalization for dedup). Every comparison, match, filter, or navigation decision is deterministic code — never an LLM judgment call, even when the LLM's own output feeds into it. See SPEC.md §4, §5.
2. **LLM calls only through the adapter.** No direct provider SDK calls outside `/lib/extraction` — this is what keeps the dual-model (Haiku/DeepSeek) choice a config switch instead of a rewrite. See SPEC.md §4.
3. **No paid infrastructure beyond LLM API usage.** Every deployment/security decision (self-hosted DB, mTLS instead of IP allowlisting, native git-based deploys) was made to stay on free tiers. Don't introduce a paid add-on without flagging it first — see DEPLOYMENT.md for the reasoning already worked through.

## Coding conventions

- Variable names and code comments: English, always.
- File/folder structure:
  - `/app` — Next.js App Router pages, layouts, API routes
  - `/trigger` — Trigger.dev task definitions, one per site + shared extraction task
  - `/lib/extraction` — LLM adapters (Claude, DeepSeek) + prompts
  - `/lib/dedup`, `/lib/filters` — deterministic logic (see decision #1 — highest-priority unit test targets)
  - `/prisma` or `/drizzle` — schema + migrations
- Static/config-shaped content (default exclusion keywords, site definitions, etc.): always in a typed data file, never hardcoded inline.
- Tests live alongside the code they cover (`*.test.ts`), not in a separate mirror tree.

## Testing

- Unit tests (Vitest): prioritize the deterministic logic called out in decision #1 — exclusion-keyword matching, duplicate-detection comparison, rate-limit counter logic — plus the extraction adapter interface (mocked provider responses, never live API calls).
- Component tests (React Testing Library): dashboard toggle behavior, trigger form's hybrid pre-checked/uncheckable selection.
- E2E (Playwright): at minimum, one full trigger → dashboard flow against a mocked/stubbed scrape.
- No live scraping or live LLM calls in CI — everything above runs against fixtures/mocks. See SPEC.md §9 for specific scenarios to cover.

## Commands

```bash
npm run dev                  # Next.js dev server
npm run build                 # production build
npm run start                  # production server (after build)
npm run lint                    # ESLint
npm run format                   # Prettier — write
npm run format:check              # Prettier — check only
npm run test                       # Vitest unit/component tests
npm run test:watch                  # Vitest in watch mode
npm run test:e2e                     # Playwright e2e tests
npm run db:migrate                    # Prisma/Drizzle migrations (local)
npx trigger.dev@latest dev             # local Trigger.dev dev server
```

Staged files are auto-linted and formatted on commit via Husky + lint-staged (`.husky/pre-commit` runs `npx lint-staged`); no need to run `lint`/`format` manually before committing.

## Reference

- `DATA_MODEL.md` — persisted schema (tables, fields, relationships) — mirrors the real Prisma/Drizzle schema
- `SPEC.md` — full behavioral specification (user flows, scraping pipeline, testing scenarios, non-functional requirements, open items)
- `DEPLOYMENT.md` — deployment targets, secrets, security setup, incident runbook
