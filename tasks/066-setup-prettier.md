---
id: 066
title: Set up Prettier (printWidth 100), auto-applied on commit
status: done
depends_on: []
parallelizable_with: []
epic:
tdd: exempt
test_command: "pnpm format:check && pnpm -r typecheck && pnpm --filter web build && pnpm test"
created: 2026-11-06
---

## Goal

One agreed code format for the whole repo, applied automatically so neither humans nor agents have to think about it. Triggered by an agent running Prettier by hand with no config and reformatting a whole file (task 057).

## Acceptance Criteria

- [ ] Prettier is installed at the repo root with defaults except `printWidth: 100` (the width the code already roughly follows). `.prettierrc` is `{ "printWidth": 100 }`; `.prettierignore` covers `node_modules`, build output (`dist`, `.wrangler`), `pnpm-lock.yaml`, `packages/db/migrations/` (generated SQL and meta JSON), and `tasks/`/`docs/` markdown only if reformatting them turns out to be noisy.
- [ ] Root scripts: `format` (`prettier --write .`) and `format:check` (`prettier --check .`).
- [ ] The whole repo is reformatted in **one commit that contains only formatting changes**, so `git blame` stays usable (add its sha to `.git-blame-ignore-revs`).
- [ ] A pre-commit hook (husky + lint-staged, installed by a root `prepare` script) runs `prettier --write` on staged files, so every commit is formatted automatically. Agents and humans never run Prettier by hand.
- [ ] `CLAUDE.md` gets one short line saying formatting is automatic on commit and nobody should run Prettier manually. `/implement-task` and the other commands need no change.
- [ ] After the reformat, `pnpm lint`, typecheck, web build and the full test suite still pass, and `pnpm format:check` is clean.

## Plan

- Why defaults plus `printWidth: 100`: one option, no config to argue about, and 100 matches the existing code. A trial run at 100 touched 50 of 125 TS files; that one-time reformat is kept in its own commit.
- Why a commit hook and not an agent rule: a rule only constrains the agent that read it. The hook also covers humans and any other tool. Husky + lint-staged are the mature, standard pair, so no custom script is needed.
- Why not CI: the repo has no `.github/workflows` today. The hook plus `format:check` in `test_command` is enough; add a CI check only if CI appears.
- Steps, in this order, as separate commits on `main`:
  1. `chore: add prettier config and scripts` (deps, `.prettierrc`, `.prettierignore`, scripts).
  2. `chore: format repo with prettier` (output of `pnpm format` only, nothing else), then record its sha in `.git-blame-ignore-revs`.
  3. `chore: format staged files on commit` (husky + lint-staged + `prepare`, CLAUDE.md line).
- Check first: `.oxlintrc`/oxlint has no formatting rules that conflict with Prettier output; confirm `pnpm lint` still passes after the reformat. Confirm `prepare` doesn't break `pnpm install` on a fresh clone or inside `scripts/dev.sh`.
- Open: the task is `tdd: exempt` because it is one-time tooling setup. Done as a `/quick-change` on `main` rather than a PR, since the loop's branch-and-PR flow would make the repo-wide reformat commit hard to review. Say if you want it on a branch/PR instead.

## Implementation Log

Commits on branch `task/066-setup-prettier` (tdd: exempt, so no red/green pair):

- `3695025` chore: add prettier config and scripts
- `0fde40f` chore: format repo with prettier (formatting only; listed in `.git-blame-ignore-revs`)
- `13d43a3` chore: format staged files on commit (husky + lint-staged + `prepare`, CLAUDE.md line)

`pnpm format:check && pnpm -r typecheck && pnpm --filter web build && pnpm test` -> all passing (31 files, 489 tests). `pnpm lint` has only the existing react-refresh warnings. The pre-commit hook ran on the third commit and worked.

## Plan Deviations

- Ran as branch + PR (user chose this when asked) instead of direct commits on `main`, because `/implement-task` was invoked. No red commit since the task is `tdd: exempt`.
- Added `tasks/` to `.prettierignore` (the Plan allowed this if noisy): reformatting touched about 35 task files and `scripts/task-status.mjs` parses their frontmatter.
- First typecheck/build/test run failed with missing `vite` modules because `node_modules` was stale after `pnpm add`. A plain `pnpm install` fixed it; not a code problem.
- `.git-blame-ignore-revs` only helps local `git blame` after `git config blame.ignoreRevsFile .git-blame-ignore-revs` (GitHub reads it automatically). Not documented.

## Review Notes

`feature-dev:code-reviewer`: no blocking issues. Minor:
1. Local blame ignores the revs file until each clone runs `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
2. If a build sets `NODE_ENV=production` at install time, devDependencies are skipped and `prepare` fails with "husky: command not found". Fix if it happens: `"prepare": "husky || true"` or `HUSKY=0`.
3. The merge must be a merge commit so `0fde40f` keeps its sha (already required by CLAUDE.md).
