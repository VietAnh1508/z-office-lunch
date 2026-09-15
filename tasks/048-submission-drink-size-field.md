---
id: 048
title: submissions.drink_size — accept and validate, not yet required
status: approved
depends_on: ["046"]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-16
---

## Goal

Add `submissions.drink_size` (denormalized text, not an FK — same resilience reasoning as
`foodRoundMenuItemId`/`drinkRoundMenuItemId`'s `onDelete: "set null"`). Accept and validate it
on submission create/edit *when sent*, but don't require it yet — that's task 050, once both
submission UIs (task 049) can satisfy the requirement. Also expose the assigned preset's
`sizeLabels` on the public round payload, and null `drinkSize` alongside the existing
`drinkRoundMenuItemId`/`drinkNote` cleanup when a curated drink item is removed.

## Acceptance Criteria

- [ ] `packages/db/src/schema.ts`: `submissions` gains `drinkSize: text("drink_size")`
      (nullable, no FK).
- [ ] New migration via `pnpm --filter db generate`, inspected and applied.
- [ ] `parseSubmissionFields` (`apps/api/src/routes/rounds.ts`, ~line 624): resolves
      `drinkSize` as follows —
      - if `drinkRoundMenuItemId` is `null` → `drinkSize = null` unconditionally (mirrors the
        existing `drinkNote` treatment)
      - else, look up the round's drink restaurant's `sizePresetId`; if `null` (no preset
        assigned) → `drinkSize = null` regardless of what was sent (ignored, not rejected — a
        stray value from a stale client shouldn't 400)
      - else (a preset is assigned): if `body.drinkSize` is a non-empty string matching one of
        the preset's `labels` exactly (after trim) → use it; if `body.drinkSize` was sent but
        doesn't match any label → `400 drinkSizeInvalid`; if `body.drinkSize` was omitted
        entirely → `drinkSize = null` (NOT required yet — task 050 flips this to a 400)
- [ ] `SubmissionFieldsResult`'s success variant gains `drinkSize: string | null`; both
      `POST /:id/submissions` and `PATCH /:id/submissions/:submissionId` destructure it from
      `fields` and include it in their `insert`/`update` value objects.
- [ ] `DELETE /:id/menu-items/:itemId` (~line 322-365): the transaction's second `submissions`
      update (currently `.set({ drinkRoundMenuItemId: null, drinkNote: null })`, ~line 350-353)
      also sets `drinkSize: null`.
- [ ] `GET /:id/submissions` (~line 809-864): select list gains `drinkSize: submissions.drinkSize`.
- [ ] `GET /:id/public` (~line 185-244): `selectRestaurantMenu` (~line 208-217) gains a
      `leftJoin` onto `sizePresets` (`restaurants.sizePresetId = sizePresets.id`) and selects
      `sizePresets.labels` as `sizeLabels` (nullable). Applies uniformly to both the food and
      drink restaurant payloads — harmless `null` on the food side, since a food restaurant can
      never have `sizePresetId` set (task 046 rejects it at the API level).
- [ ] New `ERROR_MESSAGES` entry: `drinkSizeInvalid` ("drinkSize must be one of the drink
      restaurant's preset sizes").
- [ ] `apps/web/src/routes/shared/useRoundSubmissions.ts`: `RoundSubmission` gains
      `drinkSize: string | null`.
- [ ] `apps/web/src/routes/public/usePublicRound.ts`: `PublicRoundRestaurant` gains
      `sizeLabels?: string[] | null`.
- [ ] `apps/api/src/routes/rounds.test.ts` additions: `parseSubmissionFields` drinkSize cases
      (no drink item → null; drink item, no preset → sent value ignored, stored as null; drink
      item + preset + valid label → stored; drink item + preset + invalid label → 400
      `drinkSizeInvalid`; drink item + preset + omitted → stored as null, no 400) exercised via
      both POST and PATCH; the DELETE-menu-item test extended to assert `drinkSize` also nulls;
      `GET /:id/submissions` exposes `drinkSize`; `GET /:id/public` exposes `sizeLabels` (present
      and `null` when no preset, present with labels when a preset is assigned) on both
      `foodRestaurant` and `drinkRestaurant`.

## Plan

### Schema

```ts
drinkSize: text("drink_size"),
```
added to the `submissions` table, after `drinkNote`.

### `parseSubmissionFields` (`apps/api/src/routes/rounds.ts`, ~line 624-682)

After the existing `drinkRoundMenuItemId`/drink-item-ownership validation (the `if
(drinkRoundMenuItemId !== null) { ... }` block, ~line 668-679), add: if
`drinkRoundMenuItemId !== null`, fetch the drink restaurant's `sizePresetId` — `round` already
carries `drinkRestaurantId` (validated a few lines above as the item's owner), so this is a
direct `select({ sizePresetId: restaurants.sizePresetId }).from(restaurants).where(eq(restaurants.id,
round.drinkRestaurantId))`, no join through `menuItems` needed. If `sizePresetId` is set, fetch
`sizePresets.labels` for it and validate `body.drinkSize` against them per the Acceptance
Criteria above. Extend the return type and the `{ ok: true, ... }` return statement with
`drinkSize`.

### Routes

`POST /:id/submissions` (~line 684) and `PATCH /:id/submissions/:submissionId` (~line 762):
both already destructure `fields` into named consts (~line 721, ~793) — add `drinkSize` to that
destructure and to the `insert`/`update` `.values`/`.set` object.

### `DELETE /:id/menu-items/:itemId` (~line 345-353)

Add `drinkSize: null` to the second `tx.update(submissions).set({...})` call, alongside the
existing `drinkRoundMenuItemId: null, drinkNote: null`.

### `GET /:id/submissions` select (~line 826-836)

Add `drinkSize: submissions.drinkSize` to the selected column map.

### `GET /:id/public` (~line 208-217)

```ts
const selectRestaurantMenu = (restaurantId: number) =>
  db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      menuUrl: restaurants.menuUrl,
      menuImage: restaurants.menuImage,
      sizeLabels: sizePresets.labels,
    })
    .from(restaurants)
    .leftJoin(sizePresets, eq(restaurants.sizePresetId, sizePresets.id))
    .where(eq(restaurants.id, restaurantId));
```

### Errors

Add `drinkSizeInvalid: "drinkSize must be one of the drink restaurant's preset sizes"`.

### Frontend types (no behavior change yet)

- `useRoundSubmissions.ts`: `RoundSubmission.drinkSize: string | null`.
- `usePublicRound.ts`: `PublicRoundRestaurant.sizeLabels?: string[] | null`.

No component changes in this task — the public/admin submission UIs don't read or send
`drinkSize` yet (task 049).

### Tests

Extend `apps/api/src/routes/rounds.test.ts` per Acceptance Criteria, seeding a `size_presets`
row via `seedSizePreset` (task 045) and a drink restaurant with `sizePresetId` set (task 046)
where a preset-having case is needed.

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
