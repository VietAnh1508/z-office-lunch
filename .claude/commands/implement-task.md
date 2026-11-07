---
description: Implement one approved task on a fresh feature branch via TDD phases (red commit, then one or more atomic green commits), review with feature-dev's code-reviewer agent, open a PR to main, then stop
argument-hint: [task id, optional]
---

# Implement Task

Target task id: $ARGUMENTS

Implement exactly **one** task, TDD-style, on its own feature branch, then stop. Never proceed to a second task in the same invocation. Every git/PR operation below is pre-authorized by `CLAUDE.md` — no confirmation needed.

## Steps

1. **Guard.** Stop and report if any task is already in flight: a non-`done` task in `pnpm tasks:status`, an open `task/*` branch, or an open PR. It must be merged (or closed) and flipped to `done` first.

2. **Pick the target.** Use the task id in `$ARGUMENTS`, otherwise the lowest-id entry in `pnpm tasks:status`'s "Ready to start". If none qualify, stop and say why.

3. **Branch.** Work on `task/<id>-<slug>` (slug from the task filename), created off an up-to-date `main`, or checked out if it already exists (re-run after review feedback). Read the task file fully and set `status: in_progress` (committed later in step 10).

4. **Red.** Write failing tests for the Acceptance Criteria (unit always; e2e too if the task is user-facing). Run the task's `test_command` and confirm it fails on the new assertions, not on a config/compile error. Add only the minimum scaffolding (declarations, stubs, schema + migration) needed to get there — never the behavior under test.

5. **Commit red.** Prefix `test:`, with trailer `TDD-Red: <test_command> -> N failing`. Mention any scaffolding in the body.

6. **Green.** Implement the minimum to make `test_command` (and e2e) pass.

7. **Commit green.** Prefix `feat:`/`fix:`, with trailer `TDD-Green: <test_command> -> all passing (red: <red-sha>)`. Green is a phase: split into several commits when the work splits naturally.

8. **Lint.** Run `pnpm lint` and fix findings in files this task touches, as a separate commit if non-trivial.

9. **Review, then fix.** Capture `git diff main...HEAD` and paste it into a `feature-dev:code-reviewer` prompt (the agent can't run git). Fix the findings worth fixing, each as its own `fix:`/`refactor:`/`feat:` commit with tests still passing. Behavior changes need a test first. The same applies to human PR feedback on a re-run.

   **Atomic commits.** Each commit does one logical thing and leaves tests passing (except red, which fails by design). Don't bundle unrelated changes or split one change across several. Never amend or rewrite earlier commits.

10. **Record.** In the task file, fill in the Implementation Log (red sha, each green-phase sha with what it did, `test_command` result), Plan Deviations (honestly — `/retrospective` reads this), and Review Notes (reviewer findings verbatim, plus what you did about each). Set `status: in_review` and commit as `chore:`.

11. **Push & open PR.** Push the branch and open a PR to `main` summarizing the task and review findings.

12. **Stop.** Report the PR URL and review findings. Merging and flipping to `done` is the user's step.
