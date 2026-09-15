---
id: 040
title: Extract useMenuCandidates hook and neutralize the bulk-save toast
status: approved
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

(Filled in by /implement-task.)

## Plan Deviations

(Filled in by /implement-task.)

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
