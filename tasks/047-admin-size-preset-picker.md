---
id: 047
title: Admin UI to assign a size preset on drink restaurant forms
status: approved
depends_on: ["046"]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-16
---

## Goal

Let the admin assign a size preset to a drink restaurant from its create/edit form, via a
combobox that picks an existing preset or creates a new one inline. Conditioned on
`type === "drink"`. No effect on submissions yet (task 048/049).

## Acceptance Criteria

- [ ] New `apps/web/src/routes/admin/useSizePresets.ts`: `SizePreset = { id: number; labels:
      string[] }` type, `useSizePresets()` (GET `/size-presets`), `useCreateSizePreset()` (POST
      `/size-presets`) — follows `.claude/rules/mutation-feedback.md` (`toast.success("Size
      preset created")` / `toastApiError`, invalidates the presets list query key).
- [ ] New `apps/web/src/routes/admin/SizePresetCombobox.tsx`: renders existing presets as
      `labels.join(" / ")`; typed text is split on commas (trim + drop empty segments) into a
      candidate label list; if it doesn't exactly match an existing preset, shows a "Create
      '…'" option that creates it and selects the new preset on success.
- [ ] `Restaurants.tsx` (create form): renders `<SizePresetCombobox>` only when `type ===
      "drink"`; selecting `"food"` in the type `<select>` clears any chosen preset back to
      `null`; `sizePresetId` is included in the create payload only when `type === "drink"`, and
      reset after a successful create alongside the other fields.
- [ ] `RestaurantDetail.tsx` (`RestaurantDetailsForm`, edit form): renders
      `<SizePresetCombobox>` only when `restaurant.type === "drink"` (type itself isn't editable
      here, so no flip-clearing logic is needed); `sizePresetId` is always included in the update
      payload (full-replace — see task 046's explicit data-loss-trap note), seeded from
      `restaurant.sizePresetId`.
- [ ] `useRestaurants.ts`: `Restaurant` type gains `sizePresetId: number | null`;
      `CreateRestaurantInput` gains `sizePresetId?: number`; `UpdateRestaurantInput` gains
      `sizePresetId: number | null` (always sent, matching the existing optional-field pattern).
- [ ] `Restaurants.test.tsx`: creating a drink restaurant with a chosen (existing) preset sends
      `sizePresetId` in the POST body; creating a food restaurant never sends `sizePresetId` even
      if one was picked before switching the type dropdown to food.
- [ ] `RestaurantDetail.test.tsx`: editing a drink restaurant always includes its current
      `sizePresetId` in the PATCH body when unrelated fields (e.g. name) change; the combobox
      does not render at all for a food restaurant.
- [ ] A new component test for `SizePresetCombobox` (or inline within the above two files' test
      suites) covering: selecting an existing preset, typing a brand-new comma-separated list and
      creating it, and typing a list matching an existing preset exactly (selects it, does not
      create a duplicate).

## Plan

### `useSizePresets.ts` (new file)

```ts
export type SizePreset = { id: number; labels: string[] };

export const sizePresetKeys = { all: ["size-presets"], list: () => [...sizePresetKeys.all, "list"] };

export function useSizePresets() {
  return useQuery({ queryKey: sizePresetKeys.list(), queryFn: () => api.get<SizePreset[]>("/size-presets") });
}

export function useCreateSizePreset() {
  // useMutation(labels: string[]) => api.post<SizePreset>("/size-presets", { labels })
  // onSuccess: invalidate list + toast.success("Size preset created")
  // onError: toastApiError(error, "Could not create size preset.")
}
```

### `SizePresetCombobox.tsx` (new file, admin-only — not under `public/Round/`)

Not built on `ItemCombobox` (`apps/web/src/routes/public/Round/ItemCombobox.tsx`) — that
component is `{id, name}`-only with no create path. Copy its blur-containment/listbox-open-state
mechanics rather than importing it (it's colocated with the public submission form for a
different consumer). Props:
```ts
{
  id: string;
  label: string;
  presets: SizePreset[];
  value: number | null;
  onChange: (id: number | null) => void;
  onCreate: (labels: string[]) => void;
  creating?: boolean;
}
```
Existing presets render as `labels.join(" / ")`. Typed text parses by splitting on `,`, trimming
each segment, dropping empties. If the parsed list doesn't exactly match any existing preset's
`labels` (same order, same trimmed values), show a "Create '<label / label>'" option at the
bottom of the listbox; clicking it calls `onCreate(parsedLabels)`.

### `Restaurants.tsx`

Add `const [sizePresetId, setSizePresetId] = useState<number | null>(null)` and
`const { data: sizePresets } = useSizePresets(); const createSizePreset =
useCreateSizePreset();`. Render `<SizePresetCombobox>` inside the existing type-conditional
area, gated on `type === "drink"`. In the `type` `<select>`'s `onChange`, when the new value is
`"food"`, also `setSizePresetId(null)`. In `handleSubmit`, include `sizePresetId: type ===
"drink" ? (sizePresetId ?? undefined) : undefined` in `createRestaurant.mutate(...)`; reset
`sizePresetId` to `null` in `onSuccess` alongside the other field resets.

### `RestaurantDetail.tsx` (`RestaurantDetailsForm`)

Add `const [sizePresetId, setSizePresetId] = useState<number | null>(restaurant.sizePresetId)`
and the same `useSizePresets`/`useCreateSizePreset` hooks. Render `<SizePresetCombobox>` gated
on `restaurant.type === "drink"` (no clearing logic needed — `type` isn't editable here).
`handleSubmit` always includes `sizePresetId` in `updateRestaurant.mutate({...})`, matching the
existing full-replace treatment of `contactInfo`/`note`/`menuUrl`.

### `useRestaurants.ts`

- `Restaurant`: add `sizePresetId: number | null`.
- `CreateRestaurantInput`: add `sizePresetId?: number`.
- `UpdateRestaurantInput`: add `sizePresetId: number | null`.

### Tests

- `Restaurants.test.tsx`: MSW handlers for `GET /size-presets` (seed a couple of presets) and
  `POST /size-presets`; assert the create-restaurant POST body includes/excludes `sizePresetId`
  per the type toggle.
- `RestaurantDetail.test.tsx`: assert PATCH body always carries the loaded restaurant's
  `sizePresetId`; assert the combobox is absent for a food restaurant.
- `SizePresetCombobox` behavior can be tested directly (own test file) or via these two host
  components' test suites — implementer's call, whichever needs less mock scaffolding.

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
