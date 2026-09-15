# Epic: Drink restaurant size presets

Member tasks: 045, 046, 047, 048, 049, 050. Status lives solely in each task's own frontmatter (`pnpm tasks:status`) — this file never repeats it, and isn't updated as tasks complete.

## Context

Drink restaurants offer size options (S/M/L, XS/S/M/L, Tall/Grande/Venti, …), but the labels differ per restaurant and today there's no way to capture a size at all — `docs/architecture.md` already documents that a drink item offered in multiple sizes is listed once in `MenuItem`, not split per size, and the only trace of "size" in the app is a hint in the drink-note placeholder ("e.g. size M, less ice"). This epic gives size a real, structured field.

Decisions made during planning:

- **Shared presets pool.** A preset is a reusable, admin-managed catalog entry — an ordered list of size labels (e.g. `["S","M","L"]`) — not duplicated per restaurant. Multiple restaurants can point at the same preset.
- **No separate preset name.** A preset's identity *is* its ordered label list (rendered as "S / M / L" in pickers); there's no additional name field to manage. `["S","M","L"]` and `["L","M","S"]` are different presets by design.
- **Assigned inline, no admin nav page.** The restaurant create/edit form gets a combobox that picks an existing preset or creates a new one on the spot — no dedicated "Size Presets" admin page, no delete endpoint (nothing in the API can ever delete a preset).
- **Restaurant → preset assignment is editable anytime**, unlike `type` (which is create-only because it's load-bearing for round validation). A size preset isn't load-bearing the same way, and locking it at create time would strand an admin who forgot to set it with no other way to fix it.
- **Size is required only when a drink item is actually picked from a restaurant that has a preset assigned.** The drink section itself stays fully optional, unchanged from today. Selected size is stored denormalized as `submissions.drink_size` (plain text, not an FK) — same resilience reasoning as the existing `foodRoundMenuItemId`/`drinkRoundMenuItemId` `onDelete: "set null"` FKs: a historical submission keeps showing "L" even if the preset is later edited or unassigned.

The build is sequenced so every intermediate PR stays shippable to `main` — the backend never starts *requiring* `drinkSize` until both the public and admin submission UIs are already capable of sending it (tasks 045-049 lay groundwork; 050 flips the switch).

## Tasks

- **045** — `size_presets` table + `GET`/`POST /api/size-presets` (find-or-create). Foundational, no dependents yet, fully self-contained.
- **046** — `restaurants.size_preset_id` (backend only): schema, POST/PATCH validation (drink-only, valid FK), exposed on `GET /restaurants`.
- **047** — Admin UI: assign a preset on the restaurant create/edit forms (`SizePresetCombobox`, pick-or-create).
- **048** — `submissions.drink_size` (backend): schema, `parseSubmissionFields` stores/validates it when sent but doesn't yet require it, exposed on `GET /:id/submissions` and `GET /:id/public` (`sizeLabels`), nulled alongside `drinkRoundMenuItemId`/`drinkNote` on round-menu-item removal.
- **049** — Public + admin submission UI: a required-if-drink-picked size `<select>` on both `SubmissionForm.tsx` and the admin `SubmissionEditDialog`.
- **050** — Flip backend validation to actually require `drinkSize` when a preset exists; add a Size column to the submissions table and CSV export.
