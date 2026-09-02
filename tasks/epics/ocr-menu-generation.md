# Epic: Generate menu items from an uploaded menu image via OCR

Member tasks: 035, 036, 037. Status lives solely in each task's own frontmatter (`pnpm tasks:status`) — this file never repeats it, and isn't updated as tasks complete.

## Context

Admins currently type in menu items by hand, one at a time. `docs/architecture.md`'s "Open items" section already flagged OCR-assisted menu extraction as a deferred nice-to-have, undecided between a frontier vision LLM (via Cloudflare AI Gateway) and Workers AI's native vision models. Both of those need a new Worker binding and/or a secret API key.

This epic picks a third option, settling that open item: **`tesseract.js` running client-side in the browser**. The menu image is already fetched to display it (task 027), so OCR can run entirely in the admin's browser with zero new backend infra — no binding, no secret, no server-side vision call. The trade-off is accuracy (WASM Tesseract vs. a frontier vision model) and that raw OCR text needs a parsing heuristic to become structured `{name, price}` items, not structured extraction for free. Given this is a low-stakes admin convenience (review-before-save, never auto-applied), that trade-off is accepted.

Data model constraint that shapes the backend design: `round_menu_items.menu_item_id` references `menu_items.id` with no `onDelete: cascade` (default RESTRICT) — so "replace the current menu" must never hard-delete existing rows (would FK-violate against any round, past or present, that ever curated one of them in). It reuses the existing `active` soft-delete convention instead: deactivate current active items, then insert the new ones.

## Tasks

- **035** — Bulk menu-item generation endpoint (`POST /api/restaurants/:id/menu-items/bulk`), backend only: `mode: "append"` inserts new active rows; `mode: "override"` deactivates the restaurant's current active items and inserts the new ones in one transaction — never a hard delete.
- **036** — `parseMenuText`: a pure, independently-TDD-able function that turns raw OCR text into candidate `{name, price}` rows via a line-by-line heuristic. No dependency on 035 or on OCR itself.
- **037** — The user-facing payoff, depends on both 035 and 036: a "Generate menu" button next to the uploaded image runs client-side OCR (`tesseract.js`), parses the result, shows an editable review dialog, asks override-vs-append only when the restaurant already has items, and saves via the bulk endpoint. Also updates `docs/architecture.md`'s OCR "Open item" from undecided to this decision.
