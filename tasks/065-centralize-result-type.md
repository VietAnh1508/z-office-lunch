---
id: 065
title: Centralize the parse/validation result type used across API routes
status: done
depends_on: [056]
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-06
---

## Goal

The `{ ok: true, ... } | { ok: false, error, status }` result shape is hand-written in several route files. Define one shared generic type (plus tiny helpers) and reuse it, so every route validates and replies the same way.

## Acceptance Criteria

- [ ] One shared type in `apps/api/src/lib/` (e.g. `result.ts`): `Result<T, S extends number = 400>` = `({ ok: true } & T) | { ok: false; error: string; status: S }`, with small `ok(...)` / `fail(error, status)` helpers if they read better than object literals.
- [ ] Replace the local copies, all in `apps/api/src/routes/`:
  - `rounds.ts` — `SubmissionFieldsResult` (the only one with `error` + `status 400 | 404`) and the `{ ok: true; id } | { ok: false }` in `parseOptionalRestaurantId`.
  - `menu-items.ts` — `parsePrice` (`{ ok: false }` only).
  - `size-presets.ts` — `ParsedPreset` (added in task 056).
  - `admin.ts` — the `{ ok: true }` success body of `/verify-password`, and its client-side twin `api.post<{ ok: true }>` in `apps/web/src/hooks/useAdminGate.ts`. Decide in the red phase whether the wire body should reuse the type or stay as is; don't change the HTTP response unless the tests say so.
- [ ] Parsers that today return a bare `{ ok: false }` (`parsePrice`, `parseOptionalRestaurantId`) keep working with their callers. Either make `error`/`status` optional for them or give the callers' own error messages a home; pick one and keep it consistent.
- [ ] Error-body shape `{ error: string }` is also typed once and used by `apps/web/src/lib/api.ts` (currently an inline `{ error?: string }`) if that fits without a web-to-api import; if not, leave the web side and note why in Plan Deviations.
- [ ] No behaviour change: every existing route test passes untouched. Add a small unit test for the helpers (type narrowing via `ok`, `fail` carrying status).

## Plan

- Survey found 4 route files using the pattern (`rounds.ts`, `menu-items.ts`, `size-presets.ts`, `admin.ts`) plus one web call site. Re-grep `ok: (true|false)` before starting in case more were added since.
- Start with `SubmissionFieldsResult` since it is the fullest shape; make the generic fit it, then migrate the smaller parsers.
- Wait until task 056 is merged, so `size-presets.ts` is on `main` and gets migrated in the same pass.
- Refactor only: no new endpoints, no changed messages or status codes.

## Implementation Log

(Filled in by /implement-task.)

- red commit: 7aa0bd1 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> 1 failing (result.test.ts: missing `./result` module)
- green commit: 0032d7e — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (30 files, 471 tests)

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Bare-`{ ok: false }` parsers: chose to give them their messages rather than make `error`/`status` optional. `parsePrice` fails with `ERROR_MESSAGES.priceInvalid`; `parseOptionalRestaurantId` now takes the invalid-message as a second argument (food vs drink differ). Callers reply with `result.error` / `result.status`; messages and status codes unchanged.
- `admin.ts` `/verify-password` `{ ok: true }` body and `useAdminGate`'s `api.post<{ ok: true }>` left as is: it's a plain success ack, not a parse result, and the wire body is unchanged.
- `apps/web/src/lib/api.ts` inline `{ error?: string }` left as is: web has no import path to the api package (only `@/` aliases), and adding one just for a one-field type isn't worth the coupling.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task. Two independent passes were run; the first prompt was sent without the diff pasted, so it was re-run with the diff.)

**Pass 1:** No high-confidence issues. Behaviour unchanged (same messages, statuses, wire bodies; check order preserved); types sound (discriminated union narrows, `fail(msg, 404)` infers literal 404). Minor, below threshold: `ok()` spreads the payload after `ok: true`, so a payload with its own `ok` key would override the flag at runtime; no caller does this. Putting `ok: true` after the spread would close it.

**Pass 2:** No issues at confidence 80+. Same behaviour/type conclusions. Nitpicks: same `ok()` spread-order point; two `parseOptionalRestaurantId` call lines in `rounds.ts` are ~103 chars (no formatter config enforces line length).
