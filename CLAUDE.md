# z-office-lunch

## What this is

An internal tool for running office lunch orders (see `project-idea.md` for the original idea). This repo doubles as a playground for a small AI-driven development workflow: idea → plan → approval → TDD implementation → per-task human review → repeat.

App architecture (tech stack, data model, directory layout) has not been decided yet — that's a separate discussion. This file will grow an "App" section with concrete run/test commands once it has.

We're building the AI workflow harness (this file, the commands, the task template) and the app at the same time, and expect the harness to keep changing as we learn what actually works. Treat gaps or friction in the harness itself as fair game to fix, not just app code.

## Documentation principles

- **Progressive disclosure.** If something is obvious from reading the code, don't write it down — it'll drift, and the code is always the source of truth. Write down what the code can't tell you on its own: why a decision was made, a constraint that isn't visible locally, a convention that spans files.
- **Keep this file minimal; link out for the rest.** `CLAUDE.md` should only hold what nearly every task needs (the loop, bootstrap order, pre-authorizations). Area-specific detail — database conventions, frontend/React conventions, deployment — belongs in its own doc, or a nested `CLAUDE.md` inside the relevant directory, linked from here rather than inlined. A database task shouldn't have to read React conventions to get oriented.
- **Optimize for "can a new session or a new human reconstruct state and act."** Anyone opening this repo cold should be able to tell what's done vs. in flight (`tasks/` frontmatter), how to run the app locally, how to connect to the database, how to deploy. As those exist, give each its own doc (e.g. `docs/running-locally.md`, `docs/deployment.md`) and index it here — don't fold the details into this file.

## Where things live

- `tasks/` — one markdown file per unit of work. Frontmatter `status` field is the source of truth for what's done, in progress, or waiting on review. Nothing else tracks status — don't add a separate progress log, it will drift out of sync with these files.
- `docs/architecture.md` — app data model and stack rationale, once decided. Written once, updated only when the architecture actually changes, not per task.
- `.claude/commands/plan-task.md`, `.claude/commands/implement-task.md` — the two custom commands that drive the loop below.

## The loop

1. `/plan-task <idea>` — explores the codebase, asks clarifying questions, designs an approach, and (after you approve via the normal plan-mode flow) writes one or more task files into `tasks/` with `status: approved`. Does not implement anything.
2. `/implement-task [id]` — implements exactly one approved task, TDD-style (a failing test committed first, then the implementation), then stops and hands it to `feature-dev:code-reviewer` for a pass. Never proceeds to a second task on its own.
3. You review the diff. If it's good, flip that task's `status:` to `done` (a one-line edit to its frontmatter). If not, ask for changes and re-run `/implement-task` on the same id.
4. Repeat from step 1 for the next idea, or step 2 for the next already-approved task.

Execution is strictly sequential — one task at a time — by design, so there's always exactly one thing to review at a time.

### Pre-authorization

`/implement-task` makes exactly two commits per task as normal operation — one failing-test commit (`test:` prefix), one passing-implementation commit (`feat:`/`fix:` prefix). Do not stop to ask for confirmation on those two commits specifically; that's the point of the workflow. Anything outside that (amending, force-pushing, touching other tasks) still needs confirmation as usual.

## Fresh-session bootstrap

If you're picking this project up with no prior context, read things in this order:

1. This file.
2. `git log --oneline -20` — recent history.
3. `ls tasks/` and check each file's `status` frontmatter — anything not `done` is where things left off.
4. `docs/architecture.md`, if you need the app's data model or stack rationale.
