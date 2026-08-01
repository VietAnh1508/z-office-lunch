# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) SPA, Shadcn/ui + Tailwind | Small internal tool, no SSR/SEO need; Shadcn/Tailwind work the same under Vite as under Next.js. |
| API | Hono, running as a Cloudflare Worker | Lightweight web framework built for the Workers runtime (Express needs compat shims and isn't the idiomatic fit there). |
| Deploy target | One Worker serves both `/api/*` and the built SPA's static assets (Workers `assets` binding, SPA fallback routing) | Single deploy artifact, same origin for API and frontend — no CORS to configure, simpler Playwright `baseURL`. |
| Database | Postgres on Neon | Serverless Postgres, the standard Hyperdrive pairing; plain Postgres underneath so it's portable if we ever leave Neon. |
| DB access | Cloudflare Hyperdrive + `pg` driver + Drizzle ORM | Hyperdrive pools the TCP/TLS handshake a Worker would otherwise pay per request. Drizzle is a thin SQL-like query builder — no generated-client build step, plugs directly into Hyperdrive's connection string. Requires the `nodejs_compat` compatibility flag for the `pg` driver to run on Workers. |
| Unit tests | Vitest | Fast, no separate config system beyond Vite's. |
| Integration/e2e tests | Playwright | Drives the real SPA + Worker together. |
| Menu image storage | Cloudflare R2 | Native Worker binding (`put`/`get`), no egress fees within Cloudflare's network, natural fit alongside Workers/Hyperdrive. Images are stored for reuse across rounds (see `project-idea.md` item 8), not just per-submission. |

Explicitly rejected: Supabase client SDK / RLS (the useful bits — auth, realtime — aren't needed since the app has no authorization by design; using it would mean lock-in to its SDK patterns for no benefit here). Prisma (heavier, extra edge-runtime engine step Drizzle avoids). A generated `.xlsx` via a library like `exceljs` (too heavy for what's needed, and Workers-runtime compatibility is unverified) — CSV instead, which opens/edits fine in Excel with zero extra dependency weight.

## Local dev & test database

Tests must run cheaply and fully automated, no external auth — the same reason the app has its own datastore instead of integrating Google Forms/Sheets (see task history). So:

- Local Postgres via Docker for Vitest and Playwright runs.
- `wrangler dev` and the test runner point the Hyperdrive binding at that local Postgres via the `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` environment variable (Wrangler's supported override for local Hyperdrive development) — no Neon/network access needed to run tests.
- Neon is used for staging/production only.

## Directory layout (proposed, not yet built)

pnpm workspace (this repo already prefers pnpm over npm):
- `apps/web` — the Vite React SPA
- `apps/api` — the Hono Worker (API routes + serves `apps/web`'s built assets)
- `packages/db` — Drizzle schema/migrations, imported by `apps/api` (and by `apps/web` for shared types if needed)

CSV export is generated client-side in the SPA (data volume per round is small; avoids Worker CPU cost). Two non-obvious gotchas to carry into implementation:
- Escape fields properly (food/drink "note" is free text and can contain commas, quotes, or newlines) — don't naively `.join(',')`.
- Prepend a UTF-8 BOM (`﻿`) to the CSV blob, or Excel on Windows garbles non-ASCII characters (e.g. Vietnamese names) even though the file is valid UTF-8.

## Open items — not yet decided

- **Data model.** Entities implied by `project-idea.md`: lunch rounds, menu items, employees (or just names), submissions. Not designed yet. R2 image storage strengthens the case for restaurant/menu being a reusable entity (not fields on a round) — dishes can optionally reference a stored image, shown to employees when ordering.
- **OCR menu extraction — nice-to-have, not required for v1.** Idea: admin uploads a menu photo, a vision model breaks it into structured dish items (name/price) for the admin to review and correct, rather than typing them in by hand. Deferred decisions: which model (a frontier vision LLM via Cloudflare AI Gateway, vs. Workers AI's native vision models — accuracy on messy/handwritten/non-English photos is the open question), and the review/correction UI. Core requirement (manual dish entry, admin-provided image) does not depend on this.
- **CLAUDE.md's "App" section** (concrete run/test commands) — fill in once a scaffolding task actually creates `package.json` etc., not before.
