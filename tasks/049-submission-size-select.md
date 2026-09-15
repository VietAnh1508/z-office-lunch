---
id: 049
title: Public + admin submission UI — required-if-picked drink size select
status: approved
depends_on: ["047", "048"]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-16
---

## Goal

Show a size `<select>` on both the public submission form and the admin's edit-submission
dialog whenever the round's drink restaurant has a size preset, and require a choice before
submit if a drink item is picked. This ships *before* the backend starts requiring it (task 050)
so no in-flight round with a preset-having drink restaurant becomes unusable mid-rollout.

## Acceptance Criteria

- [ ] `apps/web/src/routes/public/Round/SubmissionForm.tsx`: when `round.drinkRestaurant?.sizeLabels`
      is a non-empty array, a required `<select>` (blank `"Select a size"` option + one option
      per label) renders alongside the drink item combobox and drink note, inside the existing
      `{round.drinkItems && (...)}` block.
- [ ] Picking a drink item is still fully optional; a size is required only once a drink item is
      selected *and* the restaurant has `sizeLabels`. Clearing the drink item (via the combobox's
      `onChange(null)`) also clears any chosen size and its error.
- [ ] `handleSubmit` blocks submission (mirroring the existing food-item-required check) and sets
      a size error when a drink item is selected, the restaurant has `sizeLabels`, and no size
      was chosen.
- [ ] `buildInput()`/the local `SubmissionInput` type gains `drinkSize?: string`.
- [ ] Drink-note placeholder copy changes from `"Optional, e.g. size M, less ice"` to
      `"Optional, e.g. less ice"` (size now has its own field).
- [ ] `apps/web/src/routes/public/useSubmission.ts`: `CreateSubmissionInput` gains
      `drinkSize?: string`; `Submission` gains `drinkSize: string | null`.
- [ ] `apps/web/src/routes/admin/RoundDetail.tsx`: resolves the round's drink restaurant's
      assigned preset (via the already-loaded `restaurants` list + `useSizePresets()`) into a
      `drinkSizeLabels: string[] | null`, passed as a new prop into `SubmissionEditDialog`.
- [ ] `SubmissionEditDialog`: gains `drinkSize`/`drinkSizeError` state, seeded from
      `submission.drinkSize` in `handleOpenChange` alongside the existing seed logic; renders a
      `<select>` (reusing the file's `selectClassName`) when `drinkSizeLabels` is non-null and a
      drink item is currently selected; same required-if-picked validation as the public form;
      `drinkSize` included in the `updateSubmission.mutate(...)` payload.
- [ ] `apps/web/src/routes/shared/useRoundSubmissions.ts`: `UpdateRoundSubmissionInput` gains
      `drinkSize?: string`.
- [ ] `SubmissionForm.test.tsx` (or equivalent): submitting with a drink item picked from a
      preset-having restaurant and no size chosen shows an error and does not call the create
      mutation; picking a size and submitting includes `drinkSize` in the POST body; a
      drink restaurant with no `sizeLabels` shows no size select at all.
- [ ] `RoundDetail.test.tsx`: the edit dialog shows a size select only when the round's drink
      restaurant has a preset; submitting without a size (drink item selected) shows an error;
      submitting with a size includes it in the PATCH body; reopening the dialog on a submission
      that already has a `drinkSize` pre-selects it.

## Plan

### `usePublicRound.ts`

Already gains `sizeLabels?: string[] | null` on `PublicRoundRestaurant` from task 048 — no
further change here.

### `SubmissionForm.tsx`

- New state: `const [drinkSize, setDrinkSize] = useState<string | null>(null); const
  [drinkSizeError, setDrinkSizeError] = useState<string | null>(null);`
- Drink `ItemCombobox`'s `onChange`: when the new value is `null` (item cleared), also reset
  `drinkSize` to `null` and `drinkSizeError` to `null`.
- Inside the existing `{round.drinkItems && (...)}` block, after the drink `ItemCombobox` and
  before (or after — implementer's call on layout) the drink-note `Input`, when
  `round.drinkRestaurant?.sizeLabels?.length`:
  ```tsx
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="submission-drink-size">
      Size <span className="text-destructive">*</span>
    </Label>
    <select
      id="submission-drink-size"
      value={drinkSize ?? ""}
      onChange={(e) => { setDrinkSize(e.target.value || null); setDrinkSizeError(null); }}
      disabled={!drinkItemId}
    >
      <option value="">Select a size</option>
      {round.drinkRestaurant.sizeLabels.map((label) => (
        <option key={label} value={label}>{label}</option>
      ))}
    </select>
    {drinkSizeError && <p className="text-sm text-destructive">{drinkSizeError}</p>}
  </div>
  ```
  Follow the file's existing native-`<select>` idiom (this file already validates its own
  non-text fields — `employeeId`/`foodItemId` — via plain `useState` + manual checks in
  `handleSubmit`, not `useRequiredField`, which wraps text `Input`s only).
- `handleSubmit`: after the existing `foodValid` check, add:
  ```ts
  const drinkSizeValid =
    !drinkItemId || !round.drinkRestaurant?.sizeLabels?.length || drinkSize !== null;
  setDrinkSizeError(drinkSizeValid ? null : "Please select a size.");
  if (!employeeValid || !foodValid || !drinkSizeValid) return;
  ```
- `buildInput()`: add `drinkSize: drinkSize ?? undefined` to the returned object; update the
  local `SubmissionInput` type accordingly.
- Change the drink-note `Input`'s `placeholder` from `"Optional, e.g. size M, less ice"` to
  `"Optional, e.g. less ice"`.

### `useSubmission.ts`

- `CreateSubmissionInput`: add `drinkSize?: string`.
- `Submission`: add `drinkSize: string | null`.

### `RoundDetail.tsx`

- Add `const { data: sizePresets } = useSizePresets();` alongside the existing `useRestaurants()`
  call (~line 368).
- Compute, where `SubmissionEditDialog` is rendered (~line 634):
  ```ts
  const drinkRestaurant = restaurants?.find((r) => r.id === round.drinkRestaurantId) ?? null;
  const drinkSizeLabels =
    drinkRestaurant?.sizePresetId != null
      ? (sizePresets?.find((p) => p.id === drinkRestaurant.sizePresetId)?.labels ?? null)
      : null;
  ```
  Pass `drinkSizeLabels={drinkSizeLabels}` into `<SubmissionEditDialog>`.

### `SubmissionEditDialog` (`RoundDetail.tsx`, ~line 55-197)

- New prop `drinkSizeLabels: string[] | null`.
- New state `drinkSize`/`drinkSizeError`, seeded in `handleOpenChange` from
  `submission.drinkSize ?? null` (alongside the existing `foodItemId`/`drinkItemId`/notes
  seeding, ~line 78-90).
- Render a `<select className={selectClassName}>` (same pattern as the existing food/drink item
  `<select>`s) inside the `round.drinkRestaurantId != null` block (~line 159-187), gated on
  `drinkSizeLabels !== null`, disabled when `!drinkItemId`.
- `handleSubmit`: same required-if-picked check as the public form; include `drinkSize:
  drinkItemId && drinkSize ? drinkSize : undefined` in `updateSubmission.mutate({...})`.

### `useRoundSubmissions.ts`

`UpdateRoundSubmissionInput`: add `drinkSize?: string`.

### Tests

Extend the existing `SubmissionForm` and `RoundDetail` component test suites per Acceptance
Criteria, using MSW to serve a `PublicRound`/`Restaurant` payload with `sizeLabels`/`sizePresetId`
set.

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
