---
id: 044
title: Confirm-overwrite popup when submitting for a name that already has a submission
status: done
depends_on: []
parallelizable_with: []
epic:
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-15
---

## Goal

`POST /api/rounds/:id/submissions` already silently overwrites an employee's existing submission on a second submit (task 033). What's missing is the UX signal: right now a second submit just succeeds with no indication it replaced something. Show a confirm popup at submit time when the selected name already has a submission for this round, so the employee knows they're overwriting, can see what it currently holds, and can back out without changing anything.

## Acceptance Criteria

- [ ] `GET /api/rounds/:id/submissions?employeeId=X` returns only that employee's row(s) for the round (0 or 1); omitting the param is unchanged from today (full list). Response columns unchanged either way — no `employeeId` field added, the existing `not.toContain("employeeId")`/`not.toContain("price")` lock in `rounds.test.ts` is untouched.
- [ ] Selecting a name with an existing submission and clicking Submit opens a confirm dialog showing that submission's current food/drink item names + notes (handling a null food item from an admin-cleared submission, tasks 029–031, e.g. "No food selected") instead of submitting immediately.
- [ ] "Cancel" closes the dialog, sends no request, and leaves all typed field values unchanged.
- [ ] "Submit anyway" submits the form's current values (not the old submission's) via the existing create-submission flow, showing the same success state as a first-time submit.
- [ ] A name with no existing submission (or one whose lookup hasn't resolved yet) still submits immediately with no dialog — unchanged from today.
- [ ] `Round.test.tsx`'s "no submissions list or edit affordance" test still passes; new tests cover dialog-shown, confirm, and cancel.
- [ ] `e2e/round-lifecycle.spec.ts` clicks through the dialog on its second submission; its stale public-submissions-list assertion (from before `b48a094` removed that list) is removed in the same edit.
- [ ] `pnpm -r typecheck && pnpm --filter web build && pnpm test` passes.

## Plan

### Context / privacy note

The public round page's submissions list was deliberately removed the same day this task was planned (`b48a094`, "hide submission list from the public round page") because it let any visitor see everyone's orders. A naive implementation would refetch that same bulk list just to check "does *this* employeeId already have a submission" — reintroducing the same leak at the network level even if the UI only renders a generic message. This plan instead adds an `?employeeId=` filter to the existing `GET /:id/submissions` endpoint so the public page only ever fetches the *selected* employee's own row, never anyone else's — which also means the popup can safely show that row's details (food/drink + notes) without exposing other employees' data.

### API — `apps/api/src/routes/rounds.ts`, `GET /:id/submissions` (~line 809)

Accept an optional `employeeId` query param (`c.req.query("employeeId")`). When present and a valid integer, add `eq(submissions.employeeId, employeeId)` to the existing `where(eq(submissions.roundId, roundId))` via `and(...)`, narrowing the result to 0 or 1 rows. Select columns unchanged. When the param is absent or not a valid integer, behavior is exactly as today (full unfiltered list) — the admin `RoundDetail` view's existing unfiltered call keeps working unchanged.

Add coverage in `apps/api/src/routes/rounds.test.ts` (`describe("GET submissions")`, ~line 2440): filtering to one employee's row when others exist in the same round, and an empty array when that employee has no submission.

### Shared hook — `apps/web/src/routes/shared/useRoundSubmissions.ts`

Add:
```ts
export function useSubmissionForEmployee(roundId: number, employeeId: number | null) {
  return useQuery({
    queryKey: [...roundSubmissionKeys.list(roundId), "employee", employeeId],
    queryFn: () => api.get<RoundSubmission[]>(`/rounds/${roundId}/submissions?employeeId=${employeeId}`),
    enabled: employeeId !== null,
  });
}
```
The query key is nested under the existing `list()` key so `useCreateSubmission`'s current `invalidateQueries({ queryKey: roundSubmissionKeys.list(roundId) })` (in `apps/web/src/routes/public/useSubmission.ts`) also invalidates this one — no change needed there.

### New component — `apps/web/src/routes/public/Round/OverwriteSubmissionDialog.tsx`

Mirrors the controlled `AlertDialog` pattern already used in `apps/web/src/routes/admin/RoundDetail.tsx:320-340` ("Change restaurant?" — `open`/`onOpenChange` state, action fired from inside a form's `handleSubmit` rather than an `AlertDialogTrigger`). Props: `{ open: boolean; existing: RoundSubmission | null; pending: boolean; onCancel: () => void; onConfirm: () => void }`. Title: "You already have a submission for this round". Description states what the existing row currently holds — food item name + note, and drink item name + note only when present — falling back to something like "No food selected" when `foodName` is `null`. Footer: `AlertDialogCancel` ("Cancel") and `AlertDialogAction` ("Submit anyway", `disabled={pending}`).

### `apps/web/src/routes/public/Round/SubmissionForm.tsx`

- Call `useSubmissionForEmployee(roundId, employeeId)` to prefetch the selected employee's existing row (if any) as soon as a name is picked — a background fetch only, renders nothing on its own.
- Extract the current inline mutation-input object (built inside the `mutate(...)` call, ~line 48-58) into a `buildInput()` helper so it's reusable from both the direct-submit and confirm-then-submit paths.
- In `handleSubmit`, after the existing required-field validation: if the lookup has resolved an existing submission for this `employeeId` (`data?.[0]`), stash the built input + that existing row in local state and open the dialog instead of calling `mutate` directly. Otherwise submit immediately, unchanged from today — this also covers the lookup-not-yet-resolved case (no popup, direct submit; the backend upsert already handles the overwrite safely either way).
- Dialog's "Submit anyway" calls `createSubmission.mutate(builtInput, { onSuccess: () => setSubmitted(true) })` — same success path as a first-time submit — using whatever is currently in the form fields, not the old submission's values. "Cancel" just closes the dialog: no request, no field changes.

### Tests — `apps/web/src/routes/public/Round.test.tsx`

- Add a `GET /api/rounds/1/submissions` mock (`() => HttpResponse.json([])`) to the "no submissions list or edit affordance" test (~line 473-486) — the only test in this file currently missing one, since `SubmissionForm` will now call the new hook once an employee is selected. (Every other test already has this mock as a leftover from before `b48a094`; `onUnhandledRequest: "error"` in `apps/web/src/test/setup.ts` is why this one needs it added.)
- Add: selecting a name with an existing submission (mock `GET .../submissions?employeeId=1` returning one row) and clicking Submit shows the dialog with that row's details, and does not POST yet.
- Add: clicking "Submit anyway" POSTs and shows the success state.
- Add: clicking "Cancel" closes the dialog, makes no POST, and leaves the form's entered values intact.
- The existing "succeeds when submitting again for the same employee" test (~line 292-314) mocks `GET .../submissions` as `[]` — the dialog never fires there, left as-is.

### `e2e/round-lifecycle.spec.ts`

The resubmission block (~line 188-201) needs "Submit anyway" clicked through the new dialog before the second submission is recorded — this suite isn't part of `test_command`, so a skipped update here wouldn't fail loudly (task 033's Review Notes hit this exact trap). While touching this block: its comment and assertion at ~line 189 ("The public page's own submissions list picks up the new row... task 024", checking `page.getByRole("cell", { name: employeeName })` on the public page) references a public-page cell `b48a094` already removed and this file never updated — remove that stale assertion in the same edit.

## Implementation Log

- Red: `ba8cd49` — `pnpm test` -> 4 failing (1 API test for `?employeeId=` filtering, 3 frontend tests for the confirm-overwrite dialog: shown, confirm, cancel).
- Green: `fece43e` — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (399 tests, 26 files).
- Also fixed the two red-commit test bodies during green (see Plan Deviations) and updated `e2e/round-lifecycle.spec.ts`'s resubmission block to click through the dialog, removing the stale public-submissions-list assertion in the same edit — folded into the same green commit since it's test-only.

## Plan Deviations

- The plan built `useSubmissionForEmployee`, `OverwriteSubmissionDialog`, and the `SubmissionForm` wiring exactly as specified. Two deviations surfaced only once the frontend tests were written, both in the tests themselves, not the implementation:
  - My first version of the "dialog shown" test asserted `await screen.findByText(/no cilantro/i)` *before* clicking Submit, expecting the background prefetch to render something visible pre-click. It doesn't — `useSubmissionForEmployee` is a silent prefetch by design (per the plan), so nothing renders until the dialog itself opens. Fixed by moving that assertion to after the dialog opens and wrapping the Submit click in `waitFor` so it retries until the (near-instant, MSW-mocked) background query has resolved — otherwise the "lookup hasn't resolved yet" branch in the acceptance criteria (submit immediately, no dialog) could nondeterministically win the race in tests.
  - The "Submit anyway" test as first written skipped clicking "Submit" entirely and went straight to "Submit anyway", which doesn't exist yet at that point — an authoring mistake, not a design issue. Fixed by adding the missing first click (same `waitFor`-wrapped pattern as above).
  - Mid-session the user asked for a different visual style for the dialog's "Submitting again will replace this." line (it was rendering the same muted gray as the food/drink detail lines, easy to miss). Changed it to `font-medium text-foreground` with a bit of top margin so it reads as a distinct warning rather than blending into the list — the Plan didn't specify a style for this line beyond "states what the existing row currently holds."
- Ran `pnpm test:e2e -- e2e/round-lifecycle.spec.ts` manually (not part of `test_command`) to confirm the new dialog step actually works end-to-end. It's blocked by a pre-existing, unrelated bug: `page.getByRole("button", { name: "Add menu item" })` throws a strict-mode violation because it substring-matches the "Bulk-add menu items" button added in task 041 — present on `main` before this branch (confirmed by stashing this task's changes and re-running against the unmodified branch, same failure). Out of scope for 044; flagging for a follow-up fix to the e2e locators (should use `{ exact: true }` or a more specific role/name).
- Mid-review, the code-reviewer agent flagged the "lookup hasn't resolved yet → submit directly, no dialog" behavior as a race-condition bug. That's not a bug — it's exactly what the Plan and Acceptance Criteria call for ("A name with no existing submission (or one whose lookup hasn't resolved yet) still submits immediately with no dialog — unchanged from today", justified in the Plan by the backend upsert already handling the overwrite safely either way). The agent reviewed the diff without the task file's Acceptance Criteria for context. Its second finding — that the new tests' `waitFor(() => user.click(...))` doesn't actually wait for anything, since `user.click` never throws so `waitFor` just invokes it once — was correct and is fixed (see Review Notes).

## Review Notes

`feature-dev:code-reviewer` findings on the red→green diff, verbatim:

> ## Critical
>
> **1. Race condition lets a submission silently overwrite an existing one, bypassing the confirm dialog entirely — the exact bug this task exists to prevent.**
>
> `apps/web/src/routes/public/Round/SubmissionForm.tsx:48,75-82` (confidence 85)
>
> Selecting an employee is what *enables* `useSubmissionForEmployee` ... `data` is `undefined` while that query is loading ... so if the user clicks Submit before that GET resolves ... the form posts directly and silently overwrites the prior submission with no dialog ever shown ... Fix: gate Submit ... on the existing-submission query having settled ...
>
> **2. The new tests for this feature can't actually detect the race in #1 — they pass on timing, not on a real wait.**
>
> `apps/web/src/routes/public/Round.test.tsx:526, 571` (confidence 80)
>
> ... `waitFor(() => user.click(...))` doesn't fix this: `user.click` doesn't throw when it "succeeds" without effect, so `waitFor` just invokes it once and resolves ... Fix: wait on an observable signal that the per-employee data has loaded before clicking ...
>
> ## Checked and not flagging (below confidence bar / no impact)
>
> - `GET /:id/submissions?employeeId=X` silently falls back to the unfiltered query when `employeeId` is a non-integer string. Not a new privacy exposure — the endpoint already returns the full list when the param is omitted, no auth gate on this route. Worth a small polish (400 on a bad param) but not a functional bug.
> - `AlertDialogAction disabled={pending}` in `OverwriteSubmissionDialog.tsx` is effectively dead code — the dialog closes synchronously in the same tick `mutate` is called, before `isPending` ever renders true. No functional impact, not worth a fix.
> - `AlertDialogDescription asChild` wrapping a `<div>` — correct usage.
> - Query-string construction matches the existing `/employees?active=true` convention.
> - `api-error-handling.md` and `mutation-feedback.md` conventions are respected.

**Response:**

- Finding 1 (Critical) — **not a bug, working as specified.** The Plan and Acceptance Criteria explicitly call for this: "A name with no existing submission (**or one whose lookup hasn't resolved yet**) still submits immediately with no dialog — unchanged from today," justified by the backend upsert (task 033) already handling the overwrite safely either way. The agent reviewed only the diff, without the task file's Acceptance Criteria for context, so it read intentional, spec'd behavior as an accidental race. No change made.
- Finding 2 (Critical) — **valid, fixed.** The `waitFor(() => user.click(...))` wrapper was indeed a no-op wait, as flagged. Replaced in all three new dialog tests with a `lookupRequested` flag set inside the mocked `GET .../submissions?employeeId=` handler, polled via `await waitFor(() => expect(lookupRequested).toBe(true))` before clicking Submit — this actually blocks on the background lookup settling, making the tests deterministic regression guards for the dialog-shown/confirm/cancel paths (not for finding 1's spec'd early-submit path, which isn't a bug to guard against). Re-ran `pnpm -r typecheck && pnpm --filter web build && pnpm test` after the fix — still all passing.
- The two "checked and not flagging" items are accurate; no changes made for either (both explicitly called out as not worth fixing).
