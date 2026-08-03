---
id: 011
title: Replace native HTML5 required-field validation with custom inline UI
status: in_review
depends_on: [003]
parallelizable_with: []
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test"
created: 2026-08-02
---

## Goal

The "Add restaurant" form (task 003) relies on the native HTML `required` attribute, so submitting with an empty Name shows the browser's own validation bubble instead of an in-app styled error. Replace it with a small reusable required-field validation mechanism (plain React state, no new dependency) so this form — and the menu-items (004) and employees (005) forms coming next — show an inline error message under the field instead.

## Acceptance Criteria

- [ ] `apps/web/src/hooks/useRequiredField.ts`: a hook that owns a required text field's `value`/`error` state and exposes `onChange` (clears error on edit), `validate()` (sets an error if blank after trim, returns a boolean), `reset()`, and `inputProps` (`value`, `onChange`, `aria-invalid`) — takes the error message as a required argument, no default
- [ ] `apps/web/src/routes/admin/Restaurants.tsx`: Name field uses `useRequiredField("Name is required.")` instead of `useState` + the native `required` attribute; the `<form>` gets `noValidate`; `handleSubmit` calls `validate()` before posting and bails out if it fails; the error renders as `<p className="text-sm text-destructive">` directly under the Name input; `contactInfo` is untouched
- [ ] The existing top-level `{error && <p>}` (API/network failures) is unchanged and stays disjoint from the new field-level error
- [ ] `.claude/rules/form-validation.md` (path-scoped to `apps/web/src/**/*.tsx`): documents using `useRequiredField` + `noValidate` + inline error-under-field for any required text input, and that the top-level error state stays reserved for API/network failures
- [ ] `e2e/admin-restaurants.spec.ts`: on `/admin`, confirms the Name input has no `required` attribute and `validity.valid` is `true` while empty; clicking submit with an empty Name shows "Name is required." under the field, sets `aria-invalid="true"`, and fires no `POST /api/restaurants`; typing into the field clears both the error text and `aria-invalid`

## Plan

1. `apps/web/src/hooks/useRequiredField.ts` — new hook (value/error state, `onChange`, `validate`, `reset`, `inputProps`). One rule only ("non-blank after trim") — not a generic validation framework.
2. `apps/web/src/routes/admin/Restaurants.tsx` — swap the Name field's `useState` for `useRequiredField`, drop `required`, add `noValidate` to the form, validate-then-post in `handleSubmit`, render the inline error, `reset()` on success.
3. `.claude/rules/form-validation.md` — new path-scoped rule documenting the convention, following the precedent of `.claude/rules/api-error-handling.md`.
4. `e2e/admin-restaurants.spec.ts` — new Playwright spec (no DB writes needed): assert native validation is gone (`validity.valid === true` while empty, no `required` attribute), assert the custom error appears on empty submit with zero `POST` requests fired, assert typing clears the error.
5. This is the TDD red test for the task: today, clicking submit with an empty Name never reaches JS (the browser intercepts it), so the spec fails until `required` is removed and the custom validation is wired up.
6. Before running `playwright test`, make sure no `wrangler dev` is already running on port 8787 — `reuseExistingServer` in `playwright.config.ts` would otherwise skip the SPA rebuild and the test could run against a stale bundle.

## Implementation Log

- red commit: dd9c613 — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> 1 failing (typecheck: `Cannot find module './useRequiredField'` in `useRequiredField.test.ts`; the chained `&&` stopped the command there before build/vitest/playwright could run)
- green commit: a7c89ef — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> all passing (typecheck clean across all 3 workspaces; web build succeeded; 21/21 vitest tests passed across 8 files; 3/3 Playwright e2e tests passed, including the new `admin-restaurants.spec.ts`)

## Plan Deviations

- Plan step 4 only called out the e2e spec as new coverage. In practice I also added: a dedicated `apps/web/src/hooks/useRequiredField.test.ts` unit test suite for the new hook itself (7 cases: initial state, blank validation, whitespace-only treated as blank, non-blank passes, error clears on change, `reset()`, `inputProps` shape), and two new cases in the existing `Restaurants.test.tsx` (blocks submit + shows inline error + zero POSTs when Name is empty; typing clears the error). This wasn't spelled out in the Plan but follows step 4's general instruction ("unit tests always") — the hook is new, standalone logic, so it needed its own direct tests rather than relying solely on the e2e spec to exercise it indirectly.
- The e2e spec initially failed `tsc --noEmit` at the repo root: an explicit `HTMLInputElement` type annotation on a `page.evaluate` callback doesn't resolve, because the root `tsconfig.base.json` only includes `"lib": ["ES2022"]` (no `dom` lib) and Playwright's own types don't inject that global. Fixed by casting the callback's element parameter to a small structural type (`{ validity: { valid: boolean } }`) instead of naming `HTMLInputElement` directly — avoids depending on a DOM lib global that isn't in scope for that tsconfig. No wrong assumption beyond this local fix; nothing else about the plan changed.
- Everything else matched the Plan section as written: hook shape, `Restaurants.tsx` wiring, the `.claude/rules/form-validation.md` rule following `api-error-handling.md`'s precedent, and the e2e assertions (no `required` attribute, `validity.valid` true while empty, inline error + `aria-invalid` + zero POSTs on empty submit, error/`aria-invalid` clearing on typing). No user corrections or redirects during this task.

## Review Notes

## Review Summary: Task 011 — Custom required-field validation hook

Reviewed: `apps/web/src/hooks/useRequiredField.ts`, `apps/web/src/routes/admin/Restaurants.tsx`, `.claude/rules/form-validation.md` (diff between red and green commits for task 011).

**No issues at ≥80 confidence.** This is a clean implementation that matches the task's acceptance criteria exactly, and I verified it against `apps/web/src/components/ui/input.tsx` and the unit test suite already committed at `apps/web/src/hooks/useRequiredField.test.ts`. Walking through the specific correctness questions:

**Stale closures — none, and here's why it's safe.** `useRequiredField` returns brand-new `onChange`/`validate`/`reset` functions and a brand-new `inputProps` object on every render — nothing is wrapped in `useCallback`/`useMemo`, stored in a ref, or used as an effect dependency. Each closure therefore reads that render's `value`, and `handleSubmit` (also recreated per render in `Restaurants.tsx`) captures that same render's `name` object. The *absence* of memoization is exactly what makes this safe. It's worth flagging as a trap for future editors: if someone later wraps `validate` in `useCallback(fn, [])` "for performance," it would silently freeze `value` at `""` and make validation always fail. Might be worth a one-line caution in `.claude/rules/form-validation.md`, but not a bug in the current diff.

**`aria-invalid` computation — correct and integrates with the existing design system.** `error !== null` correctly maps to a boolean. `apps/web/src/components/ui/input.tsx:11` already carries Tailwind's `aria-invalid:border-destructive aria-invalid:ring-destructive/20` variant classes, so the hook plugs into an existing convention rather than inventing new styling — pre-validation the input renders `aria-invalid="false"` and stays unstyled, post-failed-validation it picks up the destructive styling automatically.

**Bailing out before try/catch — correct.** `Restaurants.tsx:17-31`: `if (!name.validate()) return;` sits before the `try`, so `createRestaurant.mutateAsync` is unreachable whenever validation fails. No path calls the API with a blank Name.

**Field-level vs. top-level error separation — preserved.** On failed validation: the pre-existing `setError(null)` clears any stale top-level API error, and `name.error` gets set — `name.reset()` is never reached so `name.value` also survives for the user to fix. On a failed API call: top-level `error` gets set in the `catch`, and `name.error` stays `null` (since `validate()` already returned `true` to get there). The two error states are never populated simultaneously, and neither code path touches the other's state.

**Two sub-threshold notes** (below the 80 bar, worth naming but not blocking):
- `validate()` trims for the blank check, but the un-trimmed `name.value` is what gets submitted, so `"  Sushi  "` posts with padding intact. Not a regression — the native `required` attribute had the same behavior — confidence ~50.
- `.claude/rules/form-validation.md` only documents the single-required-field case. The task's own Goal section names menu-items (004) and employees (005) as the next consumers, and those forms will likely have 2+ required fields, where a naive `if (!a.validate() || !b.validate()) return;` short-circuits and never runs (or renders the error for) `b`. Worth a follow-up line in the rule doc for the next task ("validate every field before bailing, don't short-circuit"). Confidence ~60, documentation-only, not something this diff needed to solve since Restaurants.tsx only has one required field.

**Files reviewed:**
- `apps/web/src/hooks/useRequiredField.ts`
- `apps/web/src/routes/admin/Restaurants.tsx`
- `.claude/rules/form-validation.md`
- `apps/web/src/components/ui/input.tsx` (referenced for `aria-invalid` styling confirmation)
- `apps/web/src/hooks/useRequiredField.test.ts` (referenced, unchanged, confirms hook behavior)
- `tasks/011-custom-required-field-validation.md` (acceptance criteria cross-check)
