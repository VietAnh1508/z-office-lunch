---
id: 059
title: Submission drink size (backend): store, validate, clear, expose, reset impact
status: approved
depends_on: ["058"]
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

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
