# Epic: Allow admin to fix a round's restaurant/menu after it's open

Member tasks: 029, 030, 031, 032, 033. Status lives solely in each task's own frontmatter (`pnpm tasks:status`) — this file never repeats it, and isn't updated as tasks complete.

## Context

Today, once a round leaves `draft` status, its restaurant assignments (`PATCH /api/rounds/:id`) and curated menu items (`POST`/`DELETE /api/rounds/:id/menu-items`) are frozen — enforced by `ERROR_MESSAGES.roundEditNotDraft` guards added in tasks 019/021. In practice, admin mistakes happen, or a restaurant reports mid-round that it's closed or a dish is unavailable, and there's currently no way to correct that without effectively starting over. The goal is to let the admin fix restaurant/menu mistakes on an already-`open` round, with affected employee selections simply cleared (the admin follows up with employees directly).

Design decision made during planning: rather than loosening the `draft`-only guards on those three routes directly, add a new **`open → draft` status transition** so the existing, already-correct draft-only edit routes can be reused unchanged. The admin reverts an open round to draft to fix it, edits it exactly as before, then reopens it (the existing `draft → open` transition already refuses to reopen with zero curated food items — a free re-use of `roundOpenNoFoodItems`, no new guard needed). Accepted trade-off: while reverted to draft, the round briefly disappears from the public page and can't accept submissions, same as any other draft round.

The real new problem this surfaces: once a round has been `open`, it may already have live `submissions` referencing the very `round_menu_items` rows that a draft-mode restaurant change or item removal is about to delete. That delete needs to null the affected submission fields (both the FK column and its paired free-text note) instead of orphaning or crashing — and once that can happen, an employee needs some way to fix a partially-cleared submission themselves, which surfaced a pre-existing gap (no edit-after-submit at all) worth closing alongside this.

## Tasks

- **029** — Make `submissions.food_round_menu_item_id` nullable and null-safe to read (schema + cascade-safe FK + fix an `innerJoin`/`leftJoin` asymmetry that would otherwise silently drop nulled submissions from every view). Foundational, no new admin-facing behavior.
- **030** — Null affected submissions when a draft round's restaurant change purges stale curated items (`PATCH /api/rounds/:id`).
- **031** — Null affected submission when removing a single curated menu item from a draft round (`DELETE /api/rounds/:id/menu-items/:itemId`).
- **032** — Add the `open → draft` revert transition and its confirm-gated admin UI — the actual user-facing payoff; 029-031 make it safe to use.
- **033** — Allow resubmission (a second submit for the same round+employee overwrites instead of 409ing) — closes the loop so an employee whose selection was cleared (or who just changes their mind) can fix it without admin intervention. Independent of 029-032, but discovered while designing this epic.
