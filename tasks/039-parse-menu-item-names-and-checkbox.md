---
id: 039
title: Parse pasted menu item names + Checkbox UI primitive
status: approved
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

(Filled in by /implement-task.)

## Plan Deviations

(Filled in by /implement-task.)

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
