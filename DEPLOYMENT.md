# DEPLOYMENT.md — Jobs Scraping

> Runbook for the three deployment targets this project spans. Written because "push to main" means three different things here, not one — see CLAUDE.md decision context for why the architecture ended up split this way.

## Deployment Targets Overview

| Target | What lives there | Deploy trigger |
|---|---|---|
| Vercel | Next.js app (frontend + API routes) | Push to `main` (native Git integration) |
| Trigger.dev | Background scraping tasks | Push to `main` (native GitHub integration) |
| VPS (self-hosted) | Dockerized Postgres | Migrations only, via GitHub Actions + SSH tunnel — the running Postgres instance itself isn't "deployed" per push |

## Vercel

- Standard Next.js project, connected directly to the GitHub repo.
- Auto-deploys previews on PRs, production on merge to `main`.
- Required environment variables (finalize exact list in Session 1): `DATABASE_URL` (with client cert params), Claude API key, DeepSeek API key, Better Auth secrets, GitHub/Google OAuth credentials, Trigger.dev API key.

## Trigger.dev

- Tasks live under `/trigger` in the repo.
- Deployed via Trigger.dev's native GitHub integration (no custom GitHub Actions workflow needed) — deploys automatically when `/trigger` has changes on `main`.
- Playwright is bundled via the official `@trigger.dev/build/extensions/playwright` build extension — no separate browser hosting service.
- Free tier: $5/month included usage, 10-20 concurrent runs. Expected to comfortably cover this project's on-demand, low-frequency usage.

## VPS Postgres (Self-Hosted, Dockerized)

### Why self-hosted, not managed
Considered Supabase first (already used on another project), but its free tier pauses a project after 7 days of inactivity — a real risk given this tool's on-demand, irregular usage pattern. Self-hosting on the existing VPS avoids that entirely, at the cost of owning the ops work below.

### Setup
- Postgres runs in Docker, isolated from the non-containerized Ghost blog on the same VPS — separate lifecycle, no dependency conflicts, reproducible via `docker-compose.yml` for other installers.
- `docker-compose.yml` at the repo root (also serves as the reference setup for other installers).

### Access security (no IP allowlisting)
Both Vercel's and Trigger.dev's static-outbound-IP features are paid-only (Vercel: $100/mo, Pro+; Trigger.dev: paid plans only) — out of budget, since this project only pays for LLM API usage. Mutual TLS is the free alternative: it authenticates the *caller* cryptographically instead of by source IP, so it works regardless of Vercel/Trigger.dev's dynamic IPs.
- A self-signed CA generates a client certificate; `pg_hba.conf` requires `clientcert=verify-full`.
- Client certificate and key stored as secrets in Vercel and Trigger.dev environment variables.
- fail2ban (already installed on the VPS) configured with a Postgres-specific jail to ban IPs after repeated failed connection attempts.
- Non-default port for Postgres as a minor additional deterrent against opportunistic scanning.

### Migrations
- Postgres is not exposed to GitHub Actions' runner IP ranges (too broad to allowlist meaningfully).
- A GitHub Actions workflow opens an SSH tunnel to the VPS (dedicated deploy key) and runs migrations (`prisma migrate deploy` or Drizzle equivalent) through the tunnel on push to `main`.
- Workflow file: `.github/workflows/migrate.yml` (to be written in Session 1).

## Secrets Management

| Secret | Where it's needed |
|---|---|
| `DATABASE_URL` + client cert/key | Vercel, Trigger.dev |
| Claude API key | Vercel, Trigger.dev |
| DeepSeek API key | Vercel, Trigger.dev |
| Better Auth secret + OAuth client IDs/secrets (GitHub, Google) | Vercel |
| SSH deploy key (migrations) | GitHub Actions secret only |
| Trigger.dev access token | GitHub (if a manual Actions step is ever needed instead of the native integration) |

## Incident Runbook (to expand as real incidents happen)

- **VPS down**: app degrades — dashboard/settings reads fail, scraping runs fail at the write step. No automatic failover; manual VPS restart required.
- **Client certificate needs rotation**: regenerate via the CA, update the secret in both Vercel and Trigger.dev, redeploy both.
- **fail2ban locks out a legitimate IP** (e.g., after a burst of failed migration attempts): manual `fail2ban-client unban <ip>` on the VPS.
