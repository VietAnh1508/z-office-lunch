---
id: 046
title: restaurants.size_preset_id (backend validation, no UI yet)
status: approved
depends_on: ["045"]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-16
---

## Goal

Let a restaurant reference a `size_presets` row via a nullable `size_preset_id` FK, restricted
to `type: 'drink'` restaurants, editable anytime (unlike `type`, which is create-only). Backend
only — no admin UI yet (task 047).

## Acceptance Criteria

- [ ] `packages/db/src/schema.ts`: `restaurants` gains `sizePresetId: integer("size_preset_id").references(() => sizePresets.id)` (nullable, no `onDelete` override needed — nothing can delete a `size_presets` row through the API).
- [ ] New migration via `pnpm --filter db generate`, inspected and applied.
- [ ] `POST /api/restaurants`: accepts optional `sizePresetId`.
      - If present and `type !== "drink"` → `400 sizePresetRestaurantTypeInvalid` (rejected, not silently ignored — matches the existing strictness of `typeInvalid`).
      - If present and `type === "drink"`, must reference an existing `size_presets` row → `400 sizePresetIdInvalid` if not.
- [ ] `PATCH /api/restaurants/:id`: same full-replace treatment as `contactInfo`/`note`/`menuUrl` — reads `body.sizePresetId` (nullable) every time, same validation as POST against the row's already-fetched `existing.type`.
- [ ] `GET /api/restaurants`: response rows include `sizePresetId` for free (plain column, no join).
- [ ] New `ERROR_MESSAGES` entries: `sizePresetIdInvalid` ("sizePresetId must reference an existing size preset"), `sizePresetRestaurantTypeInvalid` ("sizePresetId can only be set on a drink restaurant").
- [ ] `packages/db/src/testing.ts`'s `seedRestaurant` needs no change (new field is optional, covered by the existing `Partial<...$inferInsert>` override type).
- [ ] `apps/api/src/routes/restaurants.test.ts` additions:
      - POST with `sizePresetId` + `type: "food"` → 400 `sizePresetRestaurantTypeInvalid`
      - POST with `sizePresetId` + `type: "drink"` referencing a real preset → 201, row has `sizePresetId` set
      - POST with `sizePresetId` referencing a nonexistent preset id → 400 `sizePresetIdInvalid`
      - PATCH round-trip: a drink restaurant created with a `sizePresetId`, then PATCHed with only `name` changed but `sizePresetId` resent unchanged → still has the same `sizePresetId` (the explicit data-loss-trap test called out below)
      - PATCH clearing `sizePresetId` to `null` on a drink restaurant → succeeds, row's `sizePresetId` is `null`

## Plan

### Schema (`packages/db/src/schema.ts`)

Add to the `restaurants` table (after `menuImage`):
```ts
sizePresetId: integer("size_preset_id").references(() => sizePresets.id),
```
Needs `sizePresets` imported/defined above this point in the file (task 045 adds it).

### API (`apps/api/src/routes/restaurants.ts`)

**POST `/` (line ~88-118):** after the existing `type` check, if `body.sizePresetId !== undefined
&& body.sizePresetId !== null`:
```ts
const sizePresetId = Number(body.sizePresetId);
if (!Number.isInteger(sizePresetId)) { /* treat as sizePresetIdInvalid, 400 */ }
if (type !== "drink") return c.json({ error: ERROR_MESSAGES.sizePresetRestaurantTypeInvalid }, 400);
const [preset] = await db.select().from(sizePresets).where(eq(sizePresets.id, sizePresetId));
if (!preset) return c.json({ error: ERROR_MESSAGES.sizePresetIdInvalid }, 400);
```
Include `sizePresetId: sizePresetId ?? null` in the `insert().values({...})` call.

**PATCH `/:id` (line ~120-152):** `existing` (the pre-fetched row, line 136) already carries
`type` — reuse it for the same drink-only check, no extra query needed. Always read
`body.sizePresetId` (full-replace, matching `contactInfo`/`note`/`menuUrl`'s existing pattern)
and validate it the same way as POST when non-null. Include `sizePresetId` in the `.set({...})`
call.

**IMPORTANT — flag this explicitly for the frontend task (047) and its own tests**: because
PATCH is full-replace, any client that omits `sizePresetId` from the body will null it out. The
edit form must always send the restaurant's *current* `sizePresetId`, seeded from the loaded
`restaurant` prop, the same way it already does for `contactInfo`/`note`/`menuUrl`.

**GET `/` (line ~154-165):** no change needed — `db.select().from(restaurants)` already returns
every column.

### Errors (`apps/api/src/lib/errors.ts`)

Add `sizePresetIdInvalid: "sizePresetId must reference an existing size preset"` and
`sizePresetRestaurantTypeInvalid: "sizePresetId can only be set on a drink restaurant"`.

### Tests (`apps/api/src/routes/restaurants.test.ts`)

Add cases per Acceptance Criteria, using `seedSizePreset` from task 045's `testing.ts` addition.

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
