---
id: 056
title: Size presets backend (presets + options tables and CRUD API)
status: approved
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
