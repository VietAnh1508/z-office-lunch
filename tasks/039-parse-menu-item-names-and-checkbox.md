---
id: 039
title: Parse pasted menu item names + Checkbox UI primitive
status: in_review
depends_on: []
parallelizable_with: [040]
epic: bulk-paste-menu-items
tdd: required
test_command: "pnpm test -- apps/web/src/lib/parse-menu-item-names.test.ts"
created: 2026-09-15
---

## Goal

Add a pure `parseMenuItemNames` function that turns a pasted, newline-separated block of text into a clean list of item names, plus a `Checkbox` UI primitive — both leaf-level building blocks for the bulk-paste dialog (task 041), with no wiring into any component yet.

## Acceptance Criteria

- [ ] `apps/web/src/lib/parse-menu-item-names.ts` exports `parseMenuItemNames(text: string): string[]`.
- [ ] Splits on `\r?\n` (handles both `\n` and Windows-style `\r\n`, e.g. from a Word/Excel paste).
- [ ] Each line is trimmed; blank lines and whitespace-only lines are dropped entirely (not returned as empty strings).
- [ ] No deduplication of repeated names — pass duplicates through as-is.
- [ ] No bullet/numbering stripping (e.g. `"1. Pho"` or `"- Pho"` are returned literally, unmodified) — explicitly out of scope for this function.
- [ ] Empty string or whitespace-only input returns `[]`.
- [ ] `apps/web/src/components/ui/checkbox.tsx` exports a `Checkbox` component wrapping Radix's `Checkbox` primitive (from the `radix-ui` package, already a dependency — no new package needed), following the same wrapper convention as `apps/web/src/components/ui/label.tsx` (a `data-slot` attribute, `cn(...)`-merged `className`, forwarding all other props). No test file for this component, matching the existing undecorated Radix wrappers in this directory (`dialog.tsx`, `label.tsx` have none).

## Plan

**Why these two together:** both are leaf-level, independently-TDD-able pieces with zero dependency on each other or on the rest of the feature (task 040's hook, task 041's dialog). Bundling avoids a task that's "just" a one-file UI primitive with no test to drive it.

**`parseMenuItemNames`** (`apps/web/src/lib/parse-menu-item-names.ts`):
```ts
export function parseMenuItemNames(text: string): string[]
```
Implementation shape: `text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)`.

Test file `apps/web/src/lib/parse-menu-item-names.test.ts` (same convention as `format-price.test.ts`/`csv.test.ts` in the same directory). Cover at minimum:
- Plain multi-line input → array of trimmed names in order.
- CRLF line endings (`"Pho\r\nBun Cha\r\n"`) → same result as LF.
- Leading/trailing blank lines → dropped, not returned as `""`.
- Whitespace-only lines interspersed between real lines → dropped.
- Duplicate names → both returned (no dedup).
- Empty string input → `[]`.
- Whitespace-only input (e.g. `"   \n  \n"`) → `[]`.
- Single line, no trailing newline → single-element array.

**`Checkbox` primitive** (`apps/web/src/components/ui/checkbox.tsx`): read `apps/web/src/components/ui/label.tsx` first for the exact wrapper shape/import style to match (named import from `radix-ui`, `ComponentProps<typeof X.Root>` typing, `data-slot` attribute). Render `CheckboxPrimitive.Root` with a `CheckboxPrimitive.Indicator` child containing a `lucide-react` `Check` icon (the repo already depends on `lucide-react` for other icons — check an existing usage, e.g. in a button or the menu-image action icons, for the import convention). Named export `{ Checkbox }`.

**Files touched:** `apps/web/src/lib/parse-menu-item-names.ts` (new), `apps/web/src/lib/parse-menu-item-names.test.ts` (new), `apps/web/src/components/ui/checkbox.tsx` (new). No existing files modified.

**Verify before implementing:** confirm `radix-ui`'s package exports a `Checkbox` submodule under the same import style `label.tsx` uses (e.g. `import { Checkbox as CheckboxPrimitive } from "radix-ui"` vs. a scoped `@radix-ui/react-checkbox` package) — check `apps/web/package.json` and the exact import line in `label.tsx`/`dialog.tsx` before writing the new file, don't assume the package name from memory.

## Implementation Log

- red commit: `7e13d3e` — `pnpm test -- apps/web/src/lib/parse-menu-item-names.test.ts` -> 1 failing (module not found)
- green commit: `409a3a5` — `pnpm test -- apps/web/src/lib/parse-menu-item-names.test.ts` -> all passing (358/358 across full suite); `pnpm typecheck` and `pnpm lint` both clean.

## Plan Deviations

- Confirmed the exact Radix data-attribute convention before writing `checkbox.tsx`: `@radix-ui/react-checkbox` sets `data-state="checked"|"unchecked"|"indeterminate"` (verified by reading the installed package's source), and this repo's `shadcn/tailwind.css` import defines `@custom-variant data-checked` mapping `data-checked:` classes to `[data-state="checked"]` — matching the plan's guess, but verified rather than assumed before writing the styling classes.
- Local environment blocker, unrelated to the task itself: port 5432 was held by an unrelated project's Postgres container (`staffing-postgres`), blocking `pnpm db:up` and thus all `pnpm test` runs (the vitest global setup connects to Postgres regardless of which file is targeted). Stopped for the user to free the port themselves rather than touching another project's container; resumed once confirmed free. No code or plan impact, but worth flagging since it'll recur if that other project's container is left running.
- Everything else matched the Plan section as written.

## Review Notes

Reviewed the full task 039 diff (`apps/web/src/lib/parse-menu-item-names.ts`, `apps/web/src/lib/parse-menu-item-names.test.ts`, `apps/web/src/components/ui/checkbox.tsx`) against the task spec and the `label.tsx`/`dialog.tsx` wrapper conventions.

No issues at or above the confidence-80 threshold. Summary of what was checked:

1. `parseMenuItemNames`: one-line implementation matches the plan verbatim (`split(/\r?\n/).map(trim).filter(length>0)`). Verified against all 9 test cases (multi-line, CRLF, leading/trailing blanks, interspersed whitespace-only lines, trimming, duplicates kept, empty string, whitespace-only string, single line no trailing newline) — all correctly satisfied. No dedup, no bullet-stripping, both explicitly out of scope per the acceptance criteria and correctly not attempted. `\r`-only (old Mac) line endings aren't handled, but that's outside the stated acceptance criteria, not a real gap.

2. `checkbox.tsx`: structurally matches `label.tsx`'s wrapper convention — named import from `radix-ui`, `ComponentProps<typeof CheckboxPrimitive.Root>` typing, `data-slot` on both Root and Indicator, `cn(...)` with `className` merged last (so consumer overrides win), named export `{ Checkbox }`, `lucide-react` Check icon import matching `dialog.tsx`'s `X` icon convention. Independently verified (rather than trusting the task file's own Plan Deviations note) that `data-checked:` actually resolves: `@custom-variant data-checked { ... }` is defined in `shadcn/tailwind.css`, pulled in via `apps/web/src/index.css`'s `@import "shadcn/tailwind.css"` — so the styling classes are live, not dead code. `ring-3`/`ring-ring/50` and `border-input`/`shadow-xs` are already precedented elsewhere (`dialog.tsx` line 55, `input.tsx`).

Verdict: clean. This diff meets the task's acceptance criteria and repo conventions; no changes requested.
