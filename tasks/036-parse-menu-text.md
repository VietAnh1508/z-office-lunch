---
id: 036
title: Parse OCR text into candidate menu items
status: approved
depends_on: []
parallelizable_with: [035]
epic: ocr-menu-generation
tdd: required
test_command: "pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-09-02
---

## Goal

OCR only returns raw recognized text, not structured menu items. Add a pure, standalone function that turns raw OCR text into candidate `{name, price}` rows via a best-effort line-by-line heuristic, so the OCR-review UI (task 037) has something to populate its dialog with. No OCR call, no UI, no backend involved — this is the parsing logic only.

## Acceptance Criteria

- [ ] `parseMenuText(rawText: string): { name: string; price: string }[]` exists in `apps/web/src/lib/parse-menu-text.ts`. `price` is always a string (matching `price` everywhere else in the stack — the `numeric` DB column, `parsePrice`, `MenuItem.price` — never a `number`), and is `""` when no price could be found on a line (never omitted from the object).
- [ ] Blank and whitespace-only lines are dropped entirely — never emitted as empty-name candidates.
- [ ] A line whose last whitespace-separated token looks like a price, with at least one other word remaining, splits into `{ name: <rest of line>, price: <normalized token> }`.
- [ ] A line with no price-like trailing token becomes `{ name: <whole trimmed line>, price: "" }`.
- [ ] A line that is *only* a number (no other words) becomes `{ name: <the number as typed>, price: "" }` — the number is never treated as a price when it's the only token, since that would produce a blank `name`.
- [ ] Price normalization handles: a trailing `k`/`K` multiplier (`"45k"` → `"45000"`); a `.`/`,` thousands-grouping separator followed by exactly 3 digits (`"25.000"` / `"25,000"` → `"25000"`); a `.`/`,` decimal separator followed by 1-2 digits (`"12,50"` → `"12.50"`); a plain digit string passes through unchanged.
- [ ] Exact pairs covered by tests:
  | input line | expected |
  |---|---|
  | `"Pho Bo 25000"` | `{ name: "Pho Bo", price: "25000" }` |
  | `"Pho Bo 25.000"` | `{ name: "Pho Bo", price: "25000" }` |
  | `"Pho Ga 12,50"` | `{ name: "Pho Ga", price: "12.50" }` |
  | `"Coffee 45k"` | `{ name: "Coffee", price: "45000" }` |
  | `"Bun Cha"` | `{ name: "Bun Cha", price: "" }` |
  | `"45000"` | `{ name: "45000", price: "" }` |
  | `"Set 2 for 90000"` | `{ name: "Set 2 for", price: "90000" }` (only the trailing token is ever treated as price — the `2` mid-line is not) |
  | `"\n  \nPho Bo 25000\n"` (multi-line, with blank/whitespace lines) | `[{ name: "Pho Bo", price: "25000" }]` |

## Plan

### `apps/web/src/lib/parse-menu-text.ts` (new)

```ts
export function parseMenuText(rawText: string): { name: string; price: string }[]
```

Algorithm:
1. Split `rawText` on `\n`, `.trim()` each line, drop empty lines.
2. For each remaining line, split on whitespace. If the last word matches a price-token regex (`/^\d[\d.,]*[kK]?$/`) **and** at least one word remains after removing it, that word is the raw price token and the rejoined remainder is `name`. Otherwise the whole trimmed line is `name` and `price` is `""`.
3. Normalize a raw price token:
   - Strip a trailing `k`/`K` → parse the remaining digits as a number, multiply by 1000, stringify (no decimals).
   - Else if it contains exactly one `.`/`,` followed by exactly 3 digits → treat as thousands grouping, strip the separator.
   - Else if it contains exactly one `.`/`,` followed by 1-2 digits → treat as a decimal point, normalize the separator to `.`.
   - Else → pass the digit string through unchanged.

### `apps/web/src/lib/parse-menu-text.test.ts` (new)

TDD: write this test file first with the full table from Acceptance Criteria (each row its own `it(...)`, plus the multi-line/blank-line case), confirm it fails (function doesn't exist yet), then implement `parseMenuText` to make it pass.

Run `pnpm test -- apps/web/src/lib/parse-menu-text.test.ts`, then the full `test_command`, confirm all green.

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> N failing
- green commit: <sha> — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
