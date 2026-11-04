# Epic: Drink restaurant size presets

Member tasks: 056, 057, 058, 059, 060, 061, 062, 063. Status lives solely in each task's own frontmatter (`pnpm tasks:status`) — this file never repeats it, and isn't updated as tasks complete.

(Replaces an earlier version of this epic, tasks 045-050, which was never started: label-list presets with no name, a text `drink_size` on submissions, and no per-item sizes.)

## Context

Drink restaurants offer size options (S/M/L/XL, Tall/Grande/Venti, …), and today there's no structured way to capture one — the only trace is a hint in the drink-note placeholder ("e.g. size M, less ice"). Admin defines named size presets on a new admin page, assigns one to a drink restaurant, and unticks sizes per item (most items have every size, some only S/M). Employees pick a size on the order form.

Decisions made during planning:

- **Named presets, managed on a separate admin page** ("Sizes" nav entry): create, rename, reorder/add/remove options, delete. Delete is blocked (409) while a restaurant uses the preset.
- **`restaurants.size_preset_id`** is nullable and drink-only (400 on a food restaurant). Editable anytime.
- **Per-item availability** via `menu_item_sizes (menu_item_id, size_option_id)`, unique pair. Auto-filled with every option when a preset is assigned, when an item is created (single or bulk), and when an option is added to a preset; admin unticks the exceptions. An item with zero rows is never asked for a size.
- **`submissions.drink_size_option_id`** is an FK to `size_options`, `on delete set null`. No label snapshot — history is unimportant here.
- **Size is required** when the chosen drink item has any sizes. The API rejects a size that isn't one of that item's `menu_item_sizes`.
- **Changing or removing a restaurant's preset is never blocked.** The admin sees a confirm dialog with the number of live submissions (rounds that aren't closed — an open round can be reverted to draft keeping its orders) that will lose their size. Item size rows are deleted and re-filled for the new preset, and `drink_size_option_id` is cleared on those submissions (closed rounds untouched). Unticking a size on an item clears it the same way. The admin re-collects those orders by hand.
- **Out of scope:** per-size price (price stays one admin-only optional reference), task 038 menu generation, food restaurants.
- **Sequencing:** the backend only starts requiring a size once both submission UIs can already send one (062 before 063), so every PR is shippable to `main`.

## Tasks

- **056** — Size presets backend: `size_presets` + `size_options` tables and `/api/size-presets` CRUD.
- **057** — Restaurant preset assignment + `menu_item_sizes` table, with auto-fill of existing items.
- **058** — Item-level sizes: auto-fill for new/bulk items, per-item edit endpoint, preset option sync.
- **059** — Submission backend: `drink_size_option_id`, validation, clearing, reset impact count, sizes in public/submissions responses.
- **060** — Admin "Sizes" page.
- **061** — Admin restaurant preset select with confirm dialog, per-item size checkboxes.
- **062** — Size picker on the public order form and the admin submission edit dialog.
- **063** — Require size, Size column in table and CSV, "size missing" indicator, architecture doc.
