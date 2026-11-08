# z-office-lunch

## What this is

An internal tool for running office lunch orders (see `docs/project-idea.md` for the original idea). This repo doubles as a playground for a small AI-driven development workflow: idea → plan → approval → TDD implementation → per-task human review → repeat.

App architecture (tech stack, data model, directory layout) is decided — see `docs/architecture.md`. The scaffold described there (task `001`) is built; see the App section below for run/test commands.

We're building the AI workflow harness (this file, the commands, the task template) and the app at the same time, and expect the harness to keep changing as we learn what actually works. Treat gaps or friction in the harness itself as fair game to fix, not just app code.

## Documentation principles

- **Progressive disclosure.** If something is obvious from reading the code, don't write it down — it'll drift, and the code is always the source of truth. Write down what the code can't tell you on its own: why a decision was made, a constraint that isn't visible locally, a convention that spans files.
- **Keep this file minimal; link out for the rest.** `CLAUDE.md` should only hold what nearly every task needs (the loop, bootstrap order, pre-authorizations). Area-specific detail — database conventions, frontend/React conventions, deployment — belongs in its own doc, or a nested `CLAUDE.md` inside the relevant directory, linked from here rather than inlined. A database task shouldn't have to read React conventions to get oriented.
- **Optimize for "can a new session or a new human reconstruct state and act."** Anyone opening this repo cold should be able to tell what's done vs. in flight (`tasks/` frontmatter), how to run the app locally, how to connect to the database, how to deploy. As those exist, give each its own doc (e.g. `docs/running-locally.md`, `docs/deployment.md`) and index it here — don't fold the details into this file.

## Where things live

- `tasks/` — one markdown file per unit of work. Frontmatter `status` field is the source of truth for what's done, in progress, or waiting on review. Nothing else tracks status — don't add a separate progress log, it will drift out of sync with these files. Run `pnpm tasks:status` (`scripts/task-status.mjs`) to compute what's in-flight or ready from `depends_on` instead of scanning frontmatter by eye.
- `tasks/epics/` — one file per multi-task `/plan-task` output, holding only the "why these tasks are one thing" narrative and a static list of member task ids (see a task's `epic:` frontmatter field). Never holds a status or progress list — that stays solely in each task's own frontmatter, same rule as above. Most tasks are standalone and have no epic.
- `docs/architecture.md` — app data model and stack rationale, once decided. Written once, updated only when the architecture actually changes, not per task.
- `docs/deployment.md` — live URL, provisioned cloud resources (Cloudflare Worker/Hyperdrive/R2, Neon), how to redeploy and run migrations against production.
- `.claude/commands/plan-task.md`, `.claude/commands/implement-task.md` — the two custom commands that drive the loop below.
- `.claude/commands/fix-bug.md`, `.claude/commands/quick-change.md` — the ad-hoc, no-task-file commands for the Quick fixes flow (see below).
- `.claude/commands/retrospective.md` — run periodically (not part of the per-task loop) to scan `done` tasks' Implementation Log, Plan Deviations, and Review Notes for environment/tooling gaps, workflow drift, and recurring patterns across tasks; reports findings and proposes fixes, doesn't apply them unasked.
- `.claude/rules/` — path-scoped conventions (frontmatter `paths` glob) that surface only when working in a matching subtree, e.g. `api-error-handling.md` for `apps/api/**/*.ts`. Prefer this over a nested `CLAUDE.md` for a single, narrow convention; use a nested `CLAUDE.md` once an area needs broader context.

## The loop

1. `/plan-task <idea>` — explores the codebase, asks clarifying questions, designs an approach, and (after you approve via the normal plan-mode flow) writes one or more task files into `tasks/` with `status: approved`. Does not implement anything.
2. `/implement-task [id]` — checks out a fresh feature branch (`task/<id>-<slug>`) off `main`, implements exactly one approved task on it TDD-style (a failing test committed first, then the implementation), hands it to `feature-dev:code-reviewer` for a pass, then pushes the branch and opens a PR to `main`. Never proceeds to a second task on its own.
3. You review the PR diff on GitHub. If it's good, merge the PR **with a merge commit** (`gh pr merge --merge`) — not squash or rebase — so each task's red/green/chore TDD commits stay intact and individually visible on `main`. Then flip that task's `status:` to `done` with a small direct commit on `main` (a one-line edit to its frontmatter, nothing else bundled in). If not, leave review comments on the PR and re-run `/implement-task` on the same id — it picks the existing branch back up rather than starting a new one.
4. Repeat from step 1 for the next idea, or step 2 for the next already-approved task.

Execution is strictly sequential — one task at a time — by design, so there's always exactly one open PR to review at a time.

### Quick fixes (ad-hoc, no task file)

For small stuff that doesn't warrant a task — a one-line bug fix, a UI label/copy change, a typo, a small config tweak — skip `/plan-task` and `/implement-task` entirely. Use `/fix-bug <description>` for an actual bug, or `/quick-change <description>` for a small non-bug change; describing it in plain chat works too, but the commands make the mode explicit. Either way:

1. You describe the problem, no task file gets written.
2. Claude still goes through the loop, just lighter-weight and on whatever branch is currently checked out (usually `main`) — no new branch, no PR:
   - **Explore** the relevant code to understand what's actually there.
   - **Find the root cause** — don't patch a symptom before knowing why it happens.
   - **Implement** with TDD for bug fixes specifically: write a test that reproduces the wrong behavior and confirm it fails, then fix the code.
   - **Test** — rerun that test (and the surrounding suite where relevant) to confirm it now passes and nothing else broke.
3. Claude does **not** commit. It leaves the diff in the working tree — test included — for you to review with `git diff`, and you commit it yourself (or ask Claude to, explicitly) once you're happy with it.

Use judgment on the boundary: if the fix touches the data model, spans multiple files/areas, or needs the kind of design decision `/plan-task` exists to capture, it's not a quick fix — write a task for it instead.

### Pre-authorization

`/implement-task` does the following as normal per-task operation, with no confirmation needed for any of it:

- creating and checking out the feature branch off `main`
- commits following the TDD phases, each atomic: one failing-test commit (`test:` prefix), then one or more green-phase commits (`feat:`/`fix:`/`refactor:` prefix — the implementation plus any follow-ups from code review or human PR feedback), and one bookkeeping commit (`chore:` prefix) that records the task's status/review-notes updates
- pushing that branch to `origin`
- opening the PR to `main` via `gh pr create`

Anything outside that (amending, force-pushing, merging the PR itself, touching other tasks) still needs confirmation as usual.

## App

See `docs/architecture.md` for the stack and data model, and root `package.json` `scripts` for the full command list.

**Running locally — use the scripts, don't set things up by hand.** `pnpm dev` and `pnpm dev:hot` handle the container runtime, Postgres, migrations and `.env` files themselves (`scripts/dev-setup.sh`), so they're safe from a cold machine. Both run until killed: start them in the background, and stop them with `pnpm dev:stop`.

- `pnpm dev` — SPA built once, served by wrangler on `:8787`. Use for e2e-accurate checks; there's no rebuild on change.
- `pnpm dev:hot` — wrangler (`:8787`) plus vite (`:5173`, HMR). Use for frontend iteration, and browse `:5173`.

Gotchas the scripts don't tell you:

- Tests: run `pnpm db:up` first (Postgres must be up). To run a subset, use `pnpm test -- <path>`, not `pnpm --filter <pkg> test` (it silently no-ops).
- `pnpm test:e2e` can run alongside `pnpm dev`/`dev:hot` (e2e uses `:8788` and its own database).
- Ignore the `REPLACE_ME` placeholders in `apps/api/wrangler.jsonc`. Local dev doesn't need them.
- Formatting is automatic (husky + lint-staged runs Prettier on staged files). Don't run Prettier by hand. `tasks/` is excluded.
- Workers AI (`env.AI`, "Generate menu from image") has no local emulation. `wrangler dev` connects to the real Cloudflare account at startup, and clicking that button calls the real API. Automated tests use a fake `AI` binding. See `docs/architecture.md`, task 038.

## Fresh-session bootstrap

If you're picking this project up with no prior context, read things in this order:

1. This file.
2. `git log --oneline -20` — recent history.
3. `pnpm tasks:status` (reads `tasks/*.md` frontmatter directly, so it can't drift) — shows the in-flight task if one exists, otherwise which approved tasks are unblocked. Fall back to `ls tasks/` and reading frontmatter by hand only if you need detail beyond what it reports.
4. `docs/architecture.md`, if you need the app's data model or stack rationale.
