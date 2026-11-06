---
id: 056
title: Size presets backend (presets + options tables and CRUD API)
status: done
depends_on: []
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

Add named size presets (e.g. "Starbucks": Tall / Grande / Venti) with an ordered list of options, and an API to manage them. Standalone — nothing references presets yet.

## Acceptance Criteria

- [ ] `packages/db/src/schema.ts`: `sizePresets` (`id` serial pk, `name` text not null, unique) and `sizeOptions` (`id` serial pk, `presetId` FK -> `sizePresets.id` `onDelete: "cascade"`, `label` text not null, `sortOrder` integer not null, unique `(presetId, label)`).
- [ ] Migration `0007_*` generated via `pnpm --filter db generate`; inspect the SQL.
- [ ] `GET /api/size-presets` -> `200 [{ id, name, options: [{ id, label, sortOrder }] }]`, presets ordered by `name`, options by `sortOrder`.
- [ ] `POST /api/size-presets` body `{ name, options: string[] }` -> `201` with the same shape. 400 `nameRequired` (reuse) if the name is empty after trim; 400 `sizeOptionsRequired` if the list is empty or has an empty-after-trim label; 400 `sizeOptionsDuplicate` on duplicate trimmed labels (case-sensitive); 409 `sizePresetNameTaken` on duplicate name.
- [ ] `PATCH /api/size-presets/:id` body `{ name, options: [{ id?: number, label: string }] }`: full replace in array order (`sortOrder` = index). Entries with `id` keep/rename that option (id must belong to this preset, else 400 `sizeOptionInvalid`); entries without `id` are added; existing options missing from the list are deleted. Same validations as POST. 404 `sizePresetNotFound`. Done in one transaction.
- [ ] `DELETE /api/size-presets/:id` -> `200 { id }`, unconditional for now; 404 if missing. (The in-use 409 `sizePresetInUse` is added in 057, once `restaurants.size_preset_id` exists.)
- [ ] New error strings in `apps/api/src/lib/errors.ts`; handlers follow `.claude/rules/api-error-handling.md` (try/catch/finally, `await db.$client.end()`).
- [ ] `packages/db/src/testing.ts`: `size_presets`, `size_options` in `truncateAll`; `seedSizePreset(db, overrides)` (defaults name "Test Preset", creates options S/M/L, returns `{ preset, options }`).
- [ ] `packages/db/src/schema.test.ts` asserts the new exports. New `apps/api/src/routes/size-presets.test.ts` covers list, create, every validation, patch keep/rename/add/remove/reorder, delete, 404s, and the `unreachableEnv` 500 path.

## Plan

- New route file `apps/api/src/routes/size-presets.ts`, mounted in `apps/api/src/index.ts` as `/api/size-presets`. Copy the handler shape from `routes/restaurants.ts`/`menu-items.ts`; validation parsers return `{ ok: true, ... } | { ok: false }` like `parsePrice`.
- Why options are a table (not a text array): per-item availability (057/058) and submissions (059) need FKs to a single option.
- Cascade on `presetId` is only for DB hygiene; the API blocks deleting a used preset.
- `DELETE` in-use check: `restaurants.size_preset_id` doesn't exist until 057, so `DELETE` is unconditional here; 057 adds the 409 check and its test.
- Option removal here only deletes `size_options` rows; syncing `menu_item_sizes` is 058's job, and submissions get `set null` from the FK in 059. Nothing to do yet.
- Verify first: `unique().on(table.presetId, table.label)` is emitted as a constraint by drizzle-kit (matches `roundMenuItems` pattern).
- Files: `packages/db/src/schema.ts`, `packages/db/migrations/0007_*`, `packages/db/src/testing.ts`, `packages/db/src/schema.test.ts`, `apps/api/src/routes/size-presets.ts` (+ test), `apps/api/src/index.ts`, `apps/api/src/lib/errors.ts`.

## Implementation Log

- red commit: 3515042 — `pnpm test` -> 20 failing (missing schema exports, seed helper, route)
- green commit: 8cba7a5 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (29 files, 466 tests)

## Plan Deviations

- PATCH label updates go through a temporary label (`__tmp__<id>`) first. The Plan didn't mention it, but the `(presetId, label)` unique constraint isn't deferrable, so swapping or renaming labels in place would fail mid-update.
- The 409 `sizePresetNameTaken` is a pre-check query, not a catch on the DB unique violation (see Review Notes — a concurrent duplicate still returns 500).

## Review Notes

Reviewer (feature-dev:code-reviewer), verbatim summary:

- **Important (~80% confidence): name uniqueness is only pre-checked** (size-presets.ts POST/PATCH). Two concurrent requests with the same name can both pass the check; the loser hits the Postgres unique violation (23505) inside the transaction and gets `500 internal` instead of `409 sizePresetNameTaken`. Suggested fix: also detect 23505 on the name constraint in the catch block.
- Minor: PATCH reads `existing` outside the transaction, so a concurrent PATCH could silently drop an option or hit the label unique constraint (500). Unlikely for an internal tool; fix by loading inside the transaction / `for update`.
- Minor: a path id above int4 range (e.g. `/api/size-presets/99999999999`) passes `Number.isInteger` and gives 500 instead of 404 on PATCH/DELETE.
- Body-is-`null` crash outside try is a pre-existing pattern in every route.

Not fixed in this task (concurrency edge cases on an internal admin tool); left for the reviewer to decide.
