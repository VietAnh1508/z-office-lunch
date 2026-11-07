---
id: 060
title: Admin "Sizes" page to manage size presets
status: in_review
depends_on: [056, 059]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

Admin can create, rename, edit options of, and delete size presets from a new "Sizes" admin page.

## Acceptance Criteria

- [ ] "Sizes" link in `AdminLayout.tsx` `NAV_LINKS`, a route in `App.tsx`, and a card in `AdminOverview.tsx` (the grid is `sm:grid-cols-3`; adjust for a 4th card).
- [ ] Sizes page: add-preset form (name + options entered as a comma/newline separated list, or an add-option list — see Plan) and a list of presets showing name and "S / M / L".
- [ ] Each preset row can be edited inline: rename, add/remove/reorder options (move up/down buttons), Save/Cancel. Removing an option shows a note that submissions in open rounds using it will lose their size.
- [ ] Delete preset with an `AlertDialog` confirm; a 409 (in use) shows the server message as a toast.
- [ ] Loading / error / empty states match `Employees.tsx`. Required-field errors use `useRequiredField` (`.claude/rules/form-validation.md`); toasts live in the hooks with static messages (`.claude/rules/mutation-feedback.md`).
- [ ] Component tests (`Sizes.test.tsx`, modelled on `Employees.test.tsx`), `AdminLayout.test.tsx` updated, `e2e/admin-nav.spec.ts` gets the new link, and a small e2e `admin-sizes.spec.ts` (create a preset with a unique name).

## Plan

- Copy `routes/admin/Employees.tsx` + `useEmployees.ts` structure into `Sizes.tsx` + `useSizePresets.ts` (`sizePresetKeys`, `useSizePresets`, `useCreateSizePreset`, `useUpdateSizePreset`, `useDeleteSizePreset`; types hand-written in the hook like the others).
- Option entry: simplest is a textarea, one label per line, order = line order; moves the reorder UI out of scope. Decide in the red phase, but keep one input path, not two.
- No Select primitive exists; this page doesn't need one.
- Watch label collisions: other tests use `getByLabel("Name", {exact:false})`; label the fields "Preset name" and "Options".
- Files: `apps/web/src/routes/admin/Sizes.tsx`, `useSizePresets.ts`, `Sizes.test.tsx`, `AdminLayout.tsx`, `AdminLayout.test.tsx`, `AdminOverview.tsx`, `apps/web/src/App.tsx`, `e2e/admin-nav.spec.ts`, `e2e/admin-sizes.spec.ts`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: 49ceb1b — `pnpm test` -> Sizes.test.tsx fails to load (no `./Sizes`), 2 AdminLayout tests failing
- green commit: 61b1c58 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (35 files, 537 tests); e2e `admin-sizes` + `admin-nav` pass; `pnpm lint` only pre-existing warnings

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Acceptance criteria asked for move up/down reorder buttons, but the Plan said textarea-only and "one input path". Followed the Plan: order = line order, no reorder buttons.
- Added a small change to `useRequiredField` (onChange typed for textarea too) so the Options textarea could use it.
- Unchanged option labels keep their id on save. First version sent a renamed label as remove + add (wiping item ticks/submission sizes); the user asked for a fix, so a non-matching line at the same position as an unmatched option now keeps that option's id (follow-up red `cd91154`, green `a1ebc9c`). Adding+removing different lines at different positions is still delete + add.

## Review Notes

No issues at confidence >= 80. Reviewer checked Sizes.tsx, useSizePresets.ts, useRequiredField.ts against form-validation and mutation-feedback rules; did not read tests or nav/route changes.

Minor (~40 confidence): after a successful save the edit textarea keeps the raw typed text (e.g. "S, M" with commas); if the preset changes elsewhere before the next edit, stale text shows. Cancel resets it.
