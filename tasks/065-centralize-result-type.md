---
id: 065
title: Centralize the parse/validation result type used across API routes
status: approved
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

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
