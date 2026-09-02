---
id: 038
title: Column-aware parsing for multi-column/multi-price menu images
status: proposed
depends_on: [037]
parallelizable_with: []
epic:
tdd: required
test_command: ""
created: 2026-09-02
---

## Goal

Task 037's "Generate menu from image" (client-side `tesseract.js` + line-based `parseMenuText`
heuristic) produces poor results on real-world menus laid out as multi-column price tables,
rather than a simple one-item-per-line list. This task is **not yet planned** — it's a documented
finding, captured per task 037's own note to "revisit the heuristic against what real OCR output
actually looks like" once real data was available. `/plan-task` should pick this up to decide
whether/how to fix it.

## Real example that surfaced this

The Coffee House's public menu image (tested locally against restaurant id 48 in dev) breaks the
current pipeline in three concrete ways:

1. **Side-by-side columns.** The menu is laid out as 3 columns of categories (e.g. "Cà Phê Việt
   Nam" / "Trà Trái Cây" / "Cà Phê Đá Xay" side by side). `tesseract.js` is called with no
   layout/column hints (`apps/web/src/lib/ocr.ts` just takes `data.text`, a flat top-to-bottom,
   left-to-right string) — it reads across the whole page line by line, interleaving text from
   different columns into nonsense lines instead of keeping each column's items together.
2. **Multi-price items, sometimes on their own line.** Most drinks list 2–3 prices (S/M/L sizes).
   In one block ("Cà Phê Việt Nam"), the three prices ("29 35 39") sit on their own line *above*
   three item names ("Cà Phê Đen" / "Cà Phê Sữa" / "Bạc Sỉu"), not attached to any single line.
   `parseMenuText` (`apps/web/src/lib/parse-menu-text.ts`) only looks for a single trailing price
   token at the end of the *same* line as a name — it has no concept of a price row applying to
   several item lines that follow it.
3. **Two lines per item.** Each item is a Vietnamese name line followed by an italic English
   subtitle line (e.g. "Cà Phê Đen" / "Vietnamese coffee"). The parser treats the subtitle as its
   own nameless, priceless "item" since it operates one line at a time with no lookahead/lookbehind
   between related lines.

None of this is a bug in the regex — it's a structural mismatch between what `parseMenuText`
assumes (one logical item per line, price optionally trailing on that same line) and how dense
real-world price-table menus are actually laid out. Simpler, single-column menus (the app's own
seed data) are unaffected.

## Decision (recorded 2026-09-02)

Discussed with the user; explicitly decided **not** to invest in this now. `docs/architecture.md`'s
OCR decision already documents the accepted trade-off ("best-effort, admin reviews/edits before
saving") — this finding is a concrete instance of that trade-off, not a regression. Left as
`status: proposed` (not `approved`) so it surfaces in `pnpm tasks:status`'s needs-approval list
without being picked up by `/implement-task` — pick it up later via `/plan-task` if/when it's worth
the cost.

## Rough options for whoever picks this up (not yet a committed Plan)

- **Do nothing further** — keep documenting known-bad shapes as they're found; rely on admin
  review/edit in the generated-items dialog (task 037's built-in mitigation).
- **Small, bounded `parseMenuText` improvements** — e.g. detect "name line immediately followed by
  a bare-numbers-only line" as a name+price pair. Cheap, but doesn't touch the column-interleaving
  problem, which is the dominant failure mode on menus like this one.
- **Real column-aware parsing** — use tesseract's structured output (word/line bounding boxes, not
  just flat `data.text`) to cluster lines into column bands by x-position before running per-column
  line parsing. Meaningfully bigger scope; would need its own design pass (how to detect column
  boundaries robustly, what to do with decorative images/icons interspersed in the layout, how the
  multi-price-per-item case fits the existing single-`price`-per-candidate data model end to end
  through the bulk-create endpoint).

## Acceptance Criteria

(To be defined by `/plan-task` once this is picked up — deliberately left open pending a decision
on which option above, or another approach, is worth taking.)

## Plan

(Not yet planned — deliberately left for a future `/plan-task` pass.)
