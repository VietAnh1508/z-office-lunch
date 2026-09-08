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

- **Menu generation (task 038): server-side Workers AI vision-model call, not client-side OCR.** Task 037's client-side `tesseract.js` + heuristic text parsing (`parseMenuText`) structurally couldn't represent multi-column menu layouts — the dominant real-world case. `POST /api/restaurants/:id/generate-menu` now reads the restaurant's already-uploaded menu image server-side and calls `@cf/meta/llama-3.2-11b-vision-instruct` (an `env.AI` binding — no secret needed, billed like any other Worker binding; Workers AI's free tier comfortably covers this app's once-per-onboarding volume). The model extracts item **names only** — `price` is admin-entered by hand in the review dialog afterward (it's already optional on `MenuItem`), so there's no price text for the model to misread or normalize; a menu item offered in multiple sizes (S/M/L) is listed once, not split per size, since there's no per-size price to distinguish the entries anymore.
  - **JSON mode is not actually usable here, despite being the original reason this model was chosen over `@cf/moondream/moondream3.1-9B-A2B`.** `response_format: { type: "json_schema", ... }` is silently ignored by this model on a real call — no error, just free-text prose back — and this model's Workers AI type definition (`@cloudflare/workers-types`) has no `response_format` field at all, unlike text-only models such as Llama 3.3 70B. So the shape is requested via prompt instruction only (with a generous `max_tokens`) and validated at runtime before ever returning to the client; anything that fails to parse or match `{ items: { name }[] }` is a `500`. Llama stays the model of choice anyway — it's confirmed working end-to-end on this account, and Moondream would need its own fresh license-acceptance and shape probe for no proven accuracy benefit on an admin-review-gated feature.
  - **New Cloudflare Workers AI models require a one-time per-account license acceptance** before they'll run at all (submitting the literal prompt `"agree"` to the model) — already done for this project's one Cloudflare account (used for both local dev and production, see `docs/deployment.md`).
  - **No local emulation for the `ai` binding.** Workers AI has no local emulation — every `wrangler dev` invocation (`pnpm dev`/`dev:hot`/`test:e2e`'s webServer) establishes a real remote connection to the account's Workers AI at startup, and manually clicking "Generate menu from image" issues a real call against that account. `pnpm test`/`pnpm test:e2e`'s own test suites stay fully network-free via a fake `AI` binding double (`apps/api/src/test/fake-ai-binding.ts`) — only the dev server's own startup and manual UI interaction touch the real network.
