# Epic: Optional food restaurant on rounds

Member tasks: 052, 053, 054. Status lives solely in each task's own frontmatter (`pnpm tasks:status`) — this file never repeats it, and isn't updated as tasks complete.

## Context

A round currently needs a food restaurant; drink is optional. Admins want drink-only rounds, so the rule becomes: **a round must have at least one of food or drink restaurant**. `rounds.food_restaurant_id` is `NOT NULL`, the API rejects a missing food id (and a drink-only round could never be opened, since the open check counts curated food items), and the admin and public UIs assume food always exists.

Decisions:

- On a drink-only round the employee must pick a drink (whichever side exists is required). Food+drink rounds keep today's rules (food required, drink optional).
- The "pick at least one restaurant" error shows inline under both selects on the admin create/edit forms.
- Drink-only rounds hide the empty Food columns in the admin submissions table and CSV.
- Every layer mirrors the existing drink-optional pattern; no new abstractions.

## Tasks

- **052** — DB migration (nullable column) + API: create/update validation, open-round check, public round endpoints, submission parsing. No UI change.
- **053** — Admin UI: create/edit forms, round list/detail, edit-submission dialog, submissions table + CSV columns. Depends on 052.
- **054** — Public UI: browse list, round page, submission form, plus an e2e drink-only round. Depends on 052; runs after 053 since execution is sequential.
