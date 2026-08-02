---
id: 011
title: Replace native HTML5 required-field validation with custom inline UI
status: approved
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

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test && pnpm exec playwright test` -> all passing

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
