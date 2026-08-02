---
description: Implement one approved task on a fresh feature branch via TDD (red commit, then green commit), review with feature-dev's code-reviewer agent, open a PR to main, then stop
argument-hint: [task id, optional]
---

# Implement Task

Target task id: $ARGUMENTS

Implement exactly **one** task, TDD-style, on its own feature branch, then stop. Never proceed to a second task in the same invocation.

## Steps

1. **Guard.** Run `ls tasks/` and check every file's `status` frontmatter on `main` for `in_progress` or `in_review` (this only catches leftovers — e.g. a merged PR whose task was never flipped to `done`). Also run `git branch -a --list 'task/*'` and `gh pr list --state open` to check for an existing task branch/PR — since in-flight status now lives on that branch, this is the real signal. If any task is in flight by either check, stop immediately and report which one — it must be reviewed, merged (or closed), and flipped to `done` before a new task can start.

2. **Pick the target.** If a task id was given in `$ARGUMENTS`, use that task file. Otherwise pick the lowest-`id` task with `status: approved` whose every entry in `depends_on` is `status: done`. If none qualify, stop and report why (e.g. nothing approved, or all approved tasks are blocked on dependencies).

3. **Branch.** Make sure `main` is checked out and up to date (`git checkout main`, `git pull` if a remote is configured). If a `task/<id>-*` branch already exists (re-running after review feedback), check that out instead. Otherwise create one off `main`: `git checkout -b task/<id>-<slug>`, where `<slug>` comes from the task filename (e.g. `tasks/002-test-db-harness.md` -> `task/002-test-db-harness`). Read the task file fully. Set `status: in_progress` in its frontmatter (uncommitted for now — it lands in the bookkeeping commit in step 8).

4. **Red.** Write the failing test(s) called for by the task's Acceptance Criteria — unit tests always; add an e2e spec too if the task is user-facing and the project has e2e tooling. Run the task's `test_command` and confirm the failure is the *expected* one (the assertion you just wrote failing), not a config/syntax error. If it's the wrong kind of failure, fix the test setup before committing.

5. **Commit red.** Stage only the test/fixture files and commit with message prefix `test:` and a trailer:
   ```
   TDD-Red: <test_command> -> N failing
   ```
   This commit is pre-authorized by `CLAUDE.md` — don't ask for confirmation to make it.

6. **Green.** Implement the minimum code needed to satisfy the failing test(s). Iterate until `test_command` (and e2e, if applicable) passes fully.

7. **Commit green.** Stage the implementation and commit with message prefix `feat:` or `fix:` and a trailer:
   ```
   TDD-Green: <test_command> -> all passing (red: <red-sha>)
   ```
   Also pre-authorized — no confirmation needed.

8. **Update the task file, then review.** Fill in the Implementation Log with both commit shas and the `test_command` output summary. Set `status: in_review`. Run `git diff <red-sha> <green-sha>` yourself and capture the output — the `feature-dev:code-reviewer` agent's tool grant has no `Bash`, so it cannot run `git diff` itself despite its own instructions assuming `git diff` access; without this the agent falls back to reading whole files and can't tell task-authored changes from pre-existing code. Launch a `feature-dev:code-reviewer` agent (the same subagent `/feature-dev` uses in its Phase 6 — do NOT use the `/code-review` slash command, which is GitHub-PR-only, posts to a PR that doesn't exist yet at this point in the flow, and is far more token-heavy than needed here) with that diff text pasted directly into its prompt. Append its findings verbatim to the task file's Review Notes section.

9. **Commit task record.** Stage the task file (now `status: in_review` with the filled-in Implementation Log and Review Notes) and commit with message prefix `chore:`, e.g. `chore: record task 002 review`. Also pre-authorized.

10. **Push & open PR.** Push the branch (`git push -u origin task/<id>-<slug>`) and open a PR to `main` (`gh pr create --base main --head task/<id>-<slug> --title ... --body ...`), summarizing the task and including the review findings in the PR body. Pushing and opening this PR are pre-authorized per-task operations — no confirmation needed for either.

11. **Stop.** Report the PR URL and the review findings to the user. Do not start another task, even if more are `approved` and unblocked — that's a separate `/implement-task` invocation. Merging the PR and flipping the task's `status:` to `done` on `main` is the user's action (per `CLAUDE.md`'s loop), not this command's.
