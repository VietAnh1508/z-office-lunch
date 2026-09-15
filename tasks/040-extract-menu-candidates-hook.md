---
id: 040
title: Extract useMenuCandidates hook and neutralize the bulk-save toast
status: done
depends_on: []
parallelizable_with: [039]
epic: bulk-paste-menu-items
tdd: required
test_command: "pnpm test -- apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx"
created: 2026-09-15
---

## Goal

Extract `GenerateMenuFromImage.tsx`'s inline candidate-list state (add/remove/edit/validate rows) into a shared `useMenuCandidates` hook so the upcoming bulk-paste dialog (task 041) can reuse it instead of duplicating ~50 lines, and rename the bulk-save success toast to a flow-neutral string since both flows will share it.

## Acceptance Criteria

- [ ] `apps/web/src/routes/admin/useMenuCandidates.ts` exports a hook encapsulating: `candidates` state, `priceErrors` state, `validatePrice`, `handleCandidateChange`, `handleCandidateRemove`, `validateAllPrices`, a `reset()` function, and a seed function that takes a list of names and initializes `candidates` from them (each row gets a fresh `rowId` via `crypto.randomUUID()` and `price: ""`, matching the shape `GenerateMenuFromImage.tsx` currently builds inline).
- [ ] `GenerateMenuFromImage.tsx` is refactored to consume this hook instead of its inline state — no behavior change; its existing test suite (`GenerateMenuFromImage.test.tsx`) passes unmodified except for the toast-text assertion below.
- [ ] `useBulkCreateMenuItems`'s success toast in `apps/web/src/routes/admin/useMenuItems.ts` is renamed from `"Menu items generated"` to `"Menu items saved"`.
- [ ] `GenerateMenuFromImage.test.tsx`'s assertion on the success toast text is updated to match.
- [ ] No other behavior changes to either file.

## Plan

**Why bundle the extraction with the toast rename:** both touch the same feature (`GenerateMenuFromImage.tsx` and its direct dependencies) and exist purely to make the bulk-paste dialog in task 041 a clean consumer rather than a duplicate. The extraction alone has no new observable behavior to drive a red/green pair; the toast rename supplies it — treat the toast-string change as the task's actual TDD anchor:
- **Red**: update `GenerateMenuFromImage.test.tsx`'s assertion to expect `"Menu items saved"` (while the source still says `"Menu items generated"`) — confirm this fails.
- **Green**: rename the string in `useMenuItems.ts`, and perform the `useMenuCandidates` extraction (behavior-preserving, verified by the rest of the existing suite staying green) in the same commit.

**Hook shape** (read `GenerateMenuFromImage.tsx` lines ~26-90 first for the exact current logic to lift verbatim — don't redesign it, just relocate it):
```ts
function useMenuCandidates() {
  // candidates: MenuCandidate[]
  // priceErrors: Record<string, string | null>
  // seed(names: string[]): void      // or similarly-named — initializes candidates from plain names
  // handleCandidateChange(rowId, field, value): void
  // handleCandidateRemove(rowId): void
  // validateAllPrices(): boolean     // runs validatePrice across all rows, populates priceErrors, returns overall validity
  // reset(): void
  return { candidates, priceErrors, seed, handleCandidateChange, handleCandidateRemove, validateAllPrices, reset }
}
```
Exact field/function names should follow whatever `GenerateMenuFromImage.tsx` already calls them as closely as possible, to keep the diff a pure lift-and-shift rather than a rename-everything refactor.

**Files touched:**
- `apps/web/src/routes/admin/useMenuCandidates.ts` (new)
- `apps/web/src/routes/admin/GenerateMenuFromImage.tsx` (modified — replace inline state with hook usage)
- `apps/web/src/routes/admin/useMenuItems.ts` (modified — toast string rename only)
- `apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx` (modified — one assertion)

**Verification:** the full existing `GenerateMenuFromImage.test.tsx` suite (not just the one changed assertion) must stay green after the extraction — that's what confirms the refactor didn't change behavior. Run it before and after the extraction step to compare.

## Implementation Log

- Red: `23d2395` — updated both `"Menu items generated"` toast-text assertions in `GenerateMenuFromImage.test.tsx` to expect `"Menu items saved"`. Confirmed expected failure: `pnpm test -- apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx` -> 2 failing (both on the stale toast text), 356 passing.
- Green: `25b021c` — renamed the toast string in `useMenuItems.ts`, added `apps/web/src/routes/admin/useMenuCandidates.ts` (lifted `candidates`/`priceErrors` state, `seed`, `handleCandidateChange`, `handleCandidateRemove`, `validateAllPrices`, `reset`, and the module-private `validatePrice` verbatim from `GenerateMenuFromImage.tsx`), and refactored `GenerateMenuFromImage.tsx` to consume the hook. `pnpm test -- apps/web/src/routes/admin/GenerateMenuFromImage.test.tsx` -> all passing (24 files, 358 tests).
- `pnpm lint`: clean on all touched files (3 pre-existing warnings elsewhere, untouched by this task).

## Plan Deviations

None. The extraction was a pure lift-and-shift as planned; the only naming decision not spelled out in the Plan was calling the seed function `seed` (matching the Plan's own suggested name) and keeping `handleCandidateChange`/`handleCandidateRemove`/`validateAllPrices` names identical to their original inline versions.

## Review Notes

Reviewed task 040's diff (commit 23d2395 → 25b021c) covering `apps/web/src/routes/admin/{GenerateMenuFromImage.tsx, useMenuCandidates.ts (new), useMenuItems.ts}` and `GenerateMenuFromImage.test.tsx`.

No issues at or above the 80-confidence bar. Summary of what was checked:

- **Hook extraction is a faithful lift-and-shift.** `useMenuCandidates.ts` reproduces `validatePrice`, `handleCandidateChange`, `handleCandidateRemove`, `validateAllPrices`, and `reset` verbatim from the original inline code. All setters still use functional updater form (`setCandidates((prev) => ...)`), so there's no stale-closure regression from moving them into a hook. `validateAllPrices` still reads `candidates` from the hook's own render scope, matching original semantics.
- **`seed(names: string[])`** produces the same shape the old inline code built (`{ rowId: crypto.randomUUID(), name, price: "" }` per row) and is called with `items.map((item) => item.name)` at the one call site — equivalent to the original `items.map((item) => ({ rowId: ..., name: item.name, price: "" }))`.
- **Toast rename** (`"Menu items generated"` → `"Menu items saved"`) is a static string with no interpolation, consistent with `.claude/rules/mutation-feedback.md`. Repo-wide grep for the old string turns up only historical/narrative references in task files — no other source file (including no Playwright/e2e spec) still expects the old text, so the rename doesn't silently break `pnpm test:e2e`.
- **Test file (in the red commit `23d2395`)**: confirmed both toast-text assertions (lines 166 and 212) are the only two changed, and no other assertion was loosened or removed alongside the string change — consistent with the 356→358 passing red/green counts (no tests added or dropped).
- `validatePrice` is intentionally kept module-private in `useMenuCandidates.ts` rather than returned from the hook — this matches the task's own Plan sketch of the return shape, so not a deviation.
- Old `validatePrice` function and `MenuCandidate` type import were correctly removed from `GenerateMenuFromImage.tsx` now that they're no longer referenced there.

One non-blocking, forward-looking note (not a finding against this task, since its AC only requires seeding from names): `seed(names: string[])` takes plain name strings, so if task 041's paste flow needs to seed both name and price per row, the hook's `seed` signature will need widening then — nothing to act on now.

Verdict: the diff meets the task's acceptance criteria — behavior-preserving refactor plus the intended toast rename, no other behavior changes detected.
