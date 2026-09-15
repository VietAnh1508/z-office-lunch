---
id: 050
title: Require drink size when a preset exists; show it in the submissions table and CSV
status: approved
depends_on: ["049"]
parallelizable_with: []
epic: drink-size-presets
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-16
---

## Goal

Flip `parseSubmissionFields` from "accept drinkSize if sent" (task 048) to actually requiring it
when a drink item is picked from a restaurant with a size preset. Land this only after both
submission UIs (task 049) can already satisfy the requirement, so no existing round becomes
unsubmittable mid-rollout. Also surface the selected size in the admin submissions table and CSV
export.

## Acceptance Criteria

- [ ] `parseSubmissionFields` (`apps/api/src/routes/rounds.ts`): when `drinkRoundMenuItemId !==
      null` and the drink restaurant has a `sizePresetId` set, `body.drinkSize` must be present
      and match one of the preset's labels — `400 drinkSizeRequired` if omitted/empty, `400
      drinkSizeInvalid` (already added in task 048) if present but not a valid label.
- [ ] New `ERROR_MESSAGES` entry: `drinkSizeRequired` ("a size is required for this drink item").
- [ ] `apps/api/src/routes/rounds.test.ts`: the existing "omitted → stored as null, no 400" case
      from task 048 is replaced with "omitted → 400 drinkSizeRequired", exercised on both
      `POST /:id/submissions` and `PATCH /:id/submissions/:submissionId`.
- [ ] `apps/web/src/routes/admin/SubmissionsTable.tsx`: `SUBMISSION_COLUMNS` gains `"Drink
      size"`, positioned between `"Drink"` and `"Drink note"`; a matching `<td>` renders
      `submission.drinkSize` in the same position in the table body.
- [ ] `apps/web/src/routes/admin/RoundDetail.tsx`'s CSV row builder (`handleExportCsv`, ~line
      454-464): `s.drinkSize` inserted into the row array at the matching position (between
      `s.drinkName` and `s.drinkNote`).
- [ ] `SubmissionsTable.test.tsx` (or equivalent): a submission with a `drinkSize` renders it in
      the new column; a submission with `drinkSize: null` renders a blank cell.
- [ ] CSV export test (wherever `RoundDetail.tsx`'s export is currently covered): the generated
      CSV's header row includes "Drink size" and a submission row includes its value in the
      correct column position.

## Plan

### Backend (`apps/api/src/routes/rounds.ts`)

In `parseSubmissionFields`, the branch added in task 048 for "preset assigned, `body.drinkSize`
omitted" currently returns `drinkSize: null`. Change it to return `{ ok: false, error:
ERROR_MESSAGES.drinkSizeRequired, status: 400 }` instead. The "preset assigned + valid label" and
"preset assigned + invalid label → `drinkSizeInvalid`" branches are unchanged from task 048.

### Errors

Add `drinkSizeRequired: "a size is required for this drink item"`.

### Frontend — `SubmissionsTable.tsx`

```ts
export const SUBMISSION_COLUMNS = ["Employee", "Food", "Food note", "Drink", "Drink size", "Drink note"];
```
Add a `<td className="py-1.5 pr-4">{submission.drinkSize}</td>` between the existing `Drink`
(`submission.drinkName`) and `Drink note` (`submission.drinkNote`) cells (~line 59-60). Note this
column/`<td>`/CSV-row coupling is pre-existing (not newly introduced) — all three places
(`SUBMISSION_COLUMNS`, this file's `<td>` order, `RoundDetail.tsx`'s CSV row array order) must be
edited together.

### Frontend — `RoundDetail.tsx` CSV export (~line 454-464)

```ts
const rows = submissions.map((s) => [
  s.employeeName,
  s.foodName,
  s.foodNote,
  s.drinkName,
  s.drinkSize,
  s.drinkNote,
]);
```

### Tests

Extend `rounds.test.ts` (the omitted-drinkSize case now expects 400), `SubmissionsTable.test.tsx`
(new column rendering), and the CSV export test (header + row content) per Acceptance Criteria.

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
