---
id: 036
title: Parse OCR text into candidate menu items
status: done
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

- red commit: e9d0cd3 — `pnpm test -- apps/web/src/lib/parse-menu-text.test.ts` -> 1 failing (module not found)
- green commit: bea2ed7 — `pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (333 tests)

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently. Only list genuine deviations — if a step was carried out as the Plan described, it doesn't belong here, even if it's worth doing again.)

None. Implementation followed the Plan section as written.

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)

### Important

**1. Name loses internal whitespace formatting only when a price is found (confidence 85)** — `apps/web/src/lib/parse-menu-text.ts:33` vs `:38`.

The price-found branch rebuilds `name` via `words.slice(0, -1).join(" ")`, which collapses any run of whitespace between words down to a single space. The no-price branch instead returns `line` (the trimmed-but-otherwise-verbatim line), preserving internal whitespace as-is. Same input shape, two different normalization behaviors depending on whether the last token happens to look like a price:

```
parseMenuText("Bun    Cha")            -> { name: "Bun    Cha", price: "" }   // spacing preserved
parseMenuText("Bun    Cha 25000")      -> { name: "Bun Cha", price: "25000" } // spacing collapsed
```

OCR output is exactly the kind of source that produces irregular internal spacing (column gaps, tab-like runs from a menu layout), and this `name` flows straight into the review UI (task 037) and eventually the `menu_items.name` column, so the inconsistency is visible to a user comparing two menu lines. Fix by deriving the name the same way in both branches, e.g. `line.slice(0, line.lastIndexOf(lastWord)).trim()` in the price branch, or `words.join(" ")` in the no-price branch, so both go through the same normalization.

**2. `PRICE_TOKEN_RE` accepts token shapes `normalizePriceToken` doesn't actually handle, producing a non-numeric `price` string (confidence 85)** — `apps/web/src/lib/parse-menu-text.ts:1` and `:19`.

`PRICE_TOKEN_RE` (`/^\d[\d.,]*[kK]?$/`) matches any run of digits/dots/commas, but `normalizePriceToken` only has rules for exactly-one-separator-then-3-digits (thousands) or exactly-one-separator-then-1-2-digits (decimal). Anything else — a trailing separator (`"2."`, `"90,"`), multiple separators (`"1.234.567"`), or a mixed separator pair (`"25.000,50"`) — falls through to `return token` unchanged, so `parseMenuText` emits it verbatim as `price`.

The task file's acceptance criteria (line 19) explicitly ties this value's shape to the rest of the stack: "`price` is always a string (matching `price` everywhere else in the stack — the `numeric` DB column, `parsePrice`, `MenuItem.price`...)". A trailing period is a plausible OCR artifact (not adversarial input) — e.g. `"Set for 2."` → `{ name: "Set for", price: "2." }`. That value then:
- fails `parsePrice` in `apps/api/src/routes/menu-items.ts:12` (`Number("2.")` is finite and passes, actually — but `"1.234.567"` / `"25.000,50"` fail `Number.isFinite`), causing the bulk-create endpoint to 400 the whole batch, and
- renders as `"NaN"` via `formatPrice` (`apps/web/src/lib/format-price.ts:4`, `Intl.NumberFormat.format(Number("25.000,50"))` → `NaN` → `"NaN"`).

Tighten `PRICE_TOKEN_RE` to only the shapes `normalizePriceToken` actually understands (plain digits, digits+k, digits+one-separator+3-digits, digits+one-separator+1-2-digits), so anything else is left as part of the name instead of being misclassified as a price.

### Worth a one-line note (below headline severity, still real)

**3. Internal inconsistency in what a `.`/`,` means depending on whether `k` follows** — `apps/web/src/lib/parse-menu-text.ts:4-6` vs `:14-16`. `"12.5"` is read as a decimal (`"12.5"`), but `"12.5k"` strips the separator and treats it as a thousands grouping before multiplying (`Number("125") * 1000` → `"125000"`, not the `"12500"` you'd get by treating `.` as decimal first). Not covered by any acceptance criterion or test, and the plan's own wording ("parse the remaining digits as a number, multiply by 1000") is what got implemented, so this is a spec gap rather than a deviation — flagging for awareness, not blocking.

**4. Test coverage doesn't exercise both characters the AC names for each rule.** AC line 24 calls out `k`/`K` and `.`/`,` explicitly for the two separator rules, but `apps/web/src/lib/parse-menu-text.test.ts` only tests lowercase `k` (`"Coffee 45k"`) and comma-decimal (`"Pho Ga 12,50"`) — there's no test for `"45K"` or for dot-decimal (`"12.50"`). The implementation happens to handle both correctly, but in a TDD task where the test file is supposed to pin down the full behavior table, this is a real gap against the stated AC, not just a nitpick.

### Not flagged (checked, not real issues)

- Number-only line (`"45000"` → name, not price), mid-line numbers not treated as price (`"Set 2 for 90000"`), blank-line dropping, and the core split/normalize logic for the documented shapes (`45k`, `25.000`, `25,000`, `12,50`) all match the AC and task plan exactly — verified against `tasks/036-parse-menu-text.md`.
- `menu-items.ts`'s `parseName`/`parsePrice` (`apps/api/src/routes/menu-items.ts:8-25`) are request-body validators for a different concern (form input, not free-text OCR heuristics) — no reusable-utility duplication here.
- Multi-group thousands (`"1.234.567"`) and negative numbers aren't realistic for single-line lunch-menu prices on their own; only worth mentioning as they feed into finding 2 above.
