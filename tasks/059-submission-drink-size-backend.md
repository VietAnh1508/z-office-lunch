---
id: 059
title: Submission drink size (backend): store, validate, clear, expose, reset impact
status: in_review
depends_on: [058]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-04
---

## Goal

Submissions can carry a chosen drink size, validated against the picked item's sizes. The size is not yet required (the UIs can't send it until 062), but it's cleared and reset consistently.

## Acceptance Criteria

- [ ] Schema: `submissions.drinkSizeOptionId` nullable FK -> `sizeOptions.id`, `onDelete: "set null"`. Migration `0009_*`.
- [ ] `parseSubmissionFields` (used by POST and PATCH submissions) accepts optional `drinkSizeOptionId`. Kept only when a drink item is chosen. 400 `drinkSizeOptionInvalid` if not an integer; 400 `drinkSizeNotAvailable` if the id isn't in the chosen drink item's `menu_item_sizes`. Absent/null -> null (not required yet). Result type and both callers (`.set()`/`.values()`) carry it.
- [ ] Wherever a submission's drink item and note are nulled, `drinkSizeOptionId` is nulled too: `DELETE /:id/menu-items/:itemId` and `clearAffectedSubmissions` in `rounds.ts` (draft restaurant change) — same transaction, before the delete that triggers FK set-null.
- [ ] Changing/removing a restaurant's preset (057's PATCH) clears `drinkSizeOptionId` on submissions in rounds whose status is not `closed` (open, and draft — an open round can be reverted to draft keeping its submissions, task 032) whose drink round-menu-item belongs to that restaurant; closed rounds untouched. Same transaction as the rebuild.
- [ ] `PUT .../menu-items/:itemId/sizes` (058) clears `drinkSizeOptionId` on non-closed-round submissions for that item whose size was removed by the update. Same transaction.
- [ ] `GET /api/restaurants/:id/size-reset-impact?sizePresetId=<id|null>` -> `200 { affectedSubmissions: number }`: count of non-closed-round submissions with a non-null `drinkSizeOptionId` that a change to that preset would clear. 0 if the id equals the current preset.
- [ ] `GET /rounds/:id/public`: each drink item gains `sizes: [{ id, label }]` (ordered). `GET /rounds/:id/submissions` rows gain `drinkSizeOptionId` and `drinkSize` (label or null).
- [ ] Tests: validation, clearing in each path, reset scope (open vs closed), impact count, response shapes.

## Plan

- `selectRoundMenuItem` in `rounds.ts:698` currently selects `roundMenuItems.id` and `menuItems.restaurantId` only; also select `roundMenuItems.menuItemId` to check against `menu_item_sizes` (keyed by `menu_items.id`).
- Public items use `round_menu_items.id` as `id`; keep that, just add `sizes`. Never add price.
- The FK `set null` only handles option deletion; it does not follow the drink item being nulled, hence the explicit clears (see comment at `rounds.ts:469-472` on ordering).
- Impact endpoint lives in `restaurants.ts`; it's read-only so the UI (061) can call it before confirming. Leave PATCH itself unblocked.
- Files: `packages/db/src/schema.ts`, `migrations/0009_*`, `apps/api/src/routes/rounds.ts` (+ test, near the describes at `rounds.test.ts:2123/2465/2650`), `restaurants.ts` (+ test), `lib/errors.ts`.

## Implementation Log

(Filled in by /implement-task.)

- red commit: 11cda89 — `pnpm test` -> 15 failing (all in the new `submission-drink-size.test.ts`; the other 33 files passed)
- green commit: 1352f7f — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (34 files, 524 tests)
- `pnpm lint`: no findings in touched files (3 pre-existing web warnings only)

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- The red commit also carries the schema column, migration `0009_graceful_baron_strucker.sql`, and the two new `ERROR_MESSAGES` entries. The tests seed `drinkSizeOptionId` directly and reference the messages, so they would not typecheck or run without them. This is more than "test/fixture files only".
- Clear/count queries live in `apps/api/src/lib/menu-item-sizes.ts` (shared by restaurants.ts and menu-items.ts), not inline in `rounds.ts`/`restaurants.ts` as the Plan's file list implied.
- `drinkSizeOptionId` sent without a drink item is silently dropped (the criteria say "kept only when a drink item is chosen"), so no error is returned for it.

## Review Notes

feature-dev:code-reviewer: no issues at confidence >= 80.

Checked and found fine: no empty `inArray`/`notInArray` calls; null picks excluded by `isNotNull`; preset change clears picks before the rebuild in the same transaction; closed rounds untouched (open + draft covered); size validated against the item's `menu_item_sizes` and dropped without a drink item; cleared in both drink-nulling paths; `size-reset-impact` returns 0 for the same preset and follows the try/catch/finally rule.

Below threshold: `Number(body.drinkSizeOptionId)` accepts `true` (-> 1) and numeric strings. Harmless, since the availability check rejects anything that isn't a real size.
