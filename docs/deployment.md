# Deployment

## Topology

Production only — one Cloudflare account, one Worker, one Neon project, one R2 bucket. No
staging environment: this is a solo-maintainer internal tool with one task/one PR in flight at
a time (see `CLAUDE.md`'s loop), so a hosted staging tier didn't earn its setup cost. A Neon
branch is the cheap way to add one later if that changes.

The Worker serves both `/api/*` and the built SPA (Workers `assets` binding) from a single
origin — see `docs/architecture.md` for why that beat splitting the frontend out to a separate
static host (no CORS, e2e tests stay accurate to prod's topology).

Live at: `https://z-office-lunch-api.vietanhtong1508.workers.dev` (Cloudflare's `workers.dev`
subdomain — no custom domain set up; add one later via the Cloudflare dashboard without
touching anything else here).

**No auth in front of it.** The app has no authorization by design (see `docs/architecture.md`),
which means admin routes (create/delete restaurants, employees, rounds) are writable by anyone
with the URL. Deliberate call for now — revisit with Cloudflare Access (Zero Trust, free tier)
in front of the Worker before real usage/data goes through it.

### Diagram

The one thing to internalize: **the browser only ever talks to the Worker.** It serves the
built SPA and the `/api/*` routes from the same origin — no separate frontend host, no CORS.
The Worker then reaches two Cloudflare-native bindings (Hyperdrive, R2); Neon is the only piece
in the path not owned by Cloudflare.

```
                                 ┌──────────────────────────┐
                                 │        Browser           │
                                 │  (admin UI + employee    │
                                 │   lunch-order form)      │
                                 └────────────┬─────────────┘
                                              │ HTTPS
                                              ▼
                         https://z-office-lunch-api.<acct>.workers.dev
                    ┌────────────────────────────────────────────────┐
                    │             Cloudflare Worker                  │
                    │             (Hono, one deploy)                 │
                    │                                                │
                    │   /api/*  ──────────►  API routes (Hono)       │
                    │   /*      ──────────►  SPA static assets       │
                    │                        (apps/web/dist, with    │
                    │                         SPA-fallback routing)  │
                    └───────────┬────────────────────┬───────────────┘
                                │                    │
                    binding: HYPERDRIVE      binding: MENU_IMAGES
                                │                    │
                                ▼                    ▼
                  ┌─────────────────────┐   ┌─────────────────────┐
                  │  Cloudflare         │   │  Cloudflare R2      │
                  │  Hyperdrive         │   │  bucket             │
                  │  (connection pool + │   │  z-office-lunch-    │
                  │   query routing)    │   │  menu-images        │
                  └──────────┬──────────┘   └─────────────────────┘
                             │                  (restaurant menu
                             │ direct Postgres     photo storage)
                             │ connection
                             ▼
                  ┌─────────────────────┐
                  │   Neon Postgres     │
                  │   (z-office-lunch   │
                  │    project)         │
                  │                     │
                  │  restaurants,       │
                  │  menu_items,        │
                  │  employees,         │
                  │  rounds,            │
                  │  submissions...     │
                  └─────────────────────┘
```

## One-time cloud resources

Already provisioned (don't recreate — these are one-off, not part of a redeploy):

- **Cloudflare Hyperdrive** config `z-office-lunch-db` (binding `HYPERDRIVE` in
  `apps/api/wrangler.jsonc`), pointed at the Neon project's connection string.
- **Cloudflare R2** bucket `z-office-lunch-menu-images` (binding `MENU_IMAGES`).
- **Neon** project + database, direct (non-pooled) connection string used above — Hyperdrive
  does its own pooling, so the pooled/pgbouncer connection string is the wrong one to hand it.

If any of these need recreating (lost/rotated), see the Cloudflare Hyperdrive/R2 docs; the
`wrangler hyperdrive create`/`wrangler r2 bucket create` output tells you what to paste into
`apps/api/wrangler.jsonc`.

## Redeploying

Deploys are automatic via **Cloudflare Workers Builds** — connected directly to the GitHub repo
(`VietAnh1508/z-office-lunch`) through the Cloudflare dashboard (Workers & Pages → the Worker →
Settings → Build), not a workflow file in this repo. A push to `main` builds and deploys to
production; pushes to any other branch (PRs included) run the same build but upload a preview
*version* instead of deploying it, so they never touch production.

Dashboard configuration, for reference if it ever needs recreating:

- **Root directory**: `apps/api`
- **Build command**: `cd ../.. && pnpm install --frozen-lockfile && pnpm build` — steps back up
  to the monorepo root to install workspace deps and build the SPA into `apps/web/dist`, which
  `apps/api/wrangler.jsonc`'s `assets.directory` serves.
- **Deploy command** (production branch, i.e. `main`, only): `pnpm exec wrangler deploy`
- **Version command** (non-production branches): `npx wrangler versions upload` — uploads a
  preview version without promoting it to production.
- **Build watch paths**: `apps/api/**`, `apps/web/**`, `packages/**` (excludes `node_modules/**`,
  `.git/`) — a push touching only e.g. `docs/` or `tasks/` doesn't trigger a build.
- Builds authenticate with a scoped Cloudflare API token (`z-office-lunch-build-token`) that
  Workers Builds holds on Cloudflare's side — not a secret stored in this repo or in GitHub.

Manual deploy from a local machine still works as a fallback (e.g. to ship a change without
waiting on a push, or if Workers Builds is misbehaving):

```
pnpm deploy
```

This chains `pnpm build` (builds the SPA into `apps/web/dist`) and `wrangler deploy`, run under
a local `wrangler login` session. Don't run `pnpm --filter api deploy` directly — it skips the
build and would ship stale or missing static assets.

## Running migrations against Neon

```
DATABASE_URL="<neon direct connection string>" pnpm db:migrate
```

`packages/db/src/migrate.ts` logs the target host before migrating — check that output before
trusting the run, since a dropped/mistyped `DATABASE_URL` silently falls back to
`localhost:5432` otherwise (the fallback exists for local dev convenience, not because it's
a safe default here).

The Neon connection string's password should be treated as a secret — avoid pasting it
somewhere that ends up in durable logs/chat history you don't control. If it ever does, rotate
it from the Neon dashboard and re-run `wrangler hyperdrive create`/update with the new string;
Hyperdrive stores the credential on Cloudflare's side, so the Worker itself never holds
`DATABASE_URL` as a secret.

## Known follow-ups

- No Cloudflare Access / auth in front of the Worker — see topology note above.
- Migrations are still run manually from a local machine (see above) — deploys are automated
  (Cloudflare Workers Builds) but there's no equivalent for running migrations against Neon yet.
- pg's `sslmode=require` on the Neon connection string triggers a deprecation warning during
  migrations (a future `pg`/`pg-connection-string` major version changes its semantics) —
  not currently broken, just worth knowing about before that upgrade lands.

