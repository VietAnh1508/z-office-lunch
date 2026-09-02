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

## Directory layout

pnpm workspace (this repo already prefers pnpm over npm):
- `apps/web` — the Vite React SPA
- `apps/api` — the Hono Worker (API routes + serves `apps/web`'s built assets)
- `packages/db` — Drizzle schema/migrations, imported by `apps/api` (and by `apps/web` for shared types if needed)

CSV export is generated client-side in the SPA (data volume per round is small; avoids Worker CPU cost). Two non-obvious gotchas to carry into implementation:
- Escape fields properly (food/drink "note" is free text and can contain commas, quotes, or newlines) — don't naively `.join(',')`.
- Prepend a UTF-8 BOM (`﻿`) to the CSV blob, or Excel on Windows garbles non-ASCII characters (e.g. Vietnamese names) even though the file is valid UTF-8.

## Data model

Entities, reusable across rounds unless noted otherwise:

| Entity | Fields | Notes |
|---|---|---|
| `Restaurant` | `id`, `name`, `type` (`food`\|`drink`), `contact_info`, `note`, `menu_url` | A restaurant only ever serves food or drink, so `type` is set once at creation, not per item (moved here from `MenuItem` in task 015). `note` is general free-text admin notes; `menu_url` is a dedicated link to the restaurant's menu website (task 026 — `note` supersedes the earlier `menu_source_note`, narrower to just where the menu link/image came from). |
| `MenuItem` | `id`, `restaurant_id` (FK), `name`, `price` (nullable), `image_r2_key` (nullable), `active` (bool, default true) | Belongs permanently to a restaurant and is reused across rounds — matches R2 images being "stored for reuse across rounds, not just per-submission." Retire via `active` instead of deleting, so old submissions keep resolving. `price` is admin-only — never rendered on the employee-facing form or in the consolidated export (project-idea.md line 13). |
| `Employee` | `id`, `full_name`, `active` (bool) | Admin-maintained list employees pick from; `active` soft-deletes people who leave without breaking old submissions. |
| `Round` | `id`, `label`, `food_restaurant_id` (FK, required), `drink_restaurant_id` (FK, nullable), `deadline`, `status` (`draft`\|`open`\|`closed`), `created_at` | Drink is optional per round (project-idea.md item 1). Only one round is expected to be `open` at a time — enforced at the app layer, not a DB constraint (a Postgres partial unique index on `status = 'open'` is a cheap upgrade later if needed). `food_restaurant_id` should point at a `Restaurant` with `type = 'food'` and `drink_restaurant_id` at one with `type = 'drink'`; this isn't validated yet since no `rounds` routes exist yet (task 006 should pick this up). |
| `RoundMenuItem` | `id`, `round_id` (FK), `menu_item_id` (FK), unique on `(round_id, menu_item_id)` | The subset of a restaurant's items the admin curated in for this specific round (project-idea.md item 2: "admin selects dishes in the menu manually"). |
| `Submission` | `id`, `round_id` (FK), `employee_id` (FK), `food_round_menu_item_id` (FK → `RoundMenuItem`), `food_note` (nullable), `drink_round_menu_item_id` (FK → `RoundMenuItem`, nullable), `drink_note` (nullable), `created_at`, `updated_at`, unique on `(round_id, employee_id)` | One row per employee per round — resubmitting (item 6) updates the row in place rather than appending history. |

Consolidated export (item 7) is a join of `Submission` → `Employee`, `RoundMenuItem` → `MenuItem` (food and drink), filtered by round — directly produces the "list of names and dish/drink" CSV, with `price` excluded.

## Decisions worth recording

- **OCR menu extraction (task 037): client-side `tesseract.js`, not a server-side vision-model call.** Admin uploads a menu photo (task 027), clicks "Generate menu", and the browser runs OCR on it directly — no new Worker binding or secret needed, unlike a vision-LLM route via Cloudflare AI Gateway or Workers AI. Trade-off accepted: WASM OCR + heuristic text parsing (`parseMenuText`, task 036) is meaningfully less accurate than a frontier vision model, especially on messy/handwritten photos — this is mitigated, not solved, by the admin reviewing and editing every candidate item before it's saved (nothing is written without a save click).
