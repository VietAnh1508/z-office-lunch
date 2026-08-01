---
description: Implement one approved task via TDD (red commit, then green commit), review with feature-dev's code-reviewer agent, then stop
argument-hint: [task id, optional]
---

# Implement Task

Target task id: $ARGUMENTS

Implement exactly **one** task, TDD-style, then stop. Never proceed to a second task in the same invocation.

## Steps

1. **Guard.** Run `ls tasks/` and check every file's `status` frontmatter. If any task is currently `in_progress` or `in_review`, stop immediately and report which one — it must be reviewed and flipped to `done` (or sent back) before a new task can start.

2. **Pick the target.** If a task id was given in `$ARGUMENTS`, use that task file. Otherwise pick the lowest-`id` task with `status: approved` whose every entry in `depends_on` is `status: done`. If none qualify, stop and report why (e.g. nothing approved, or all approved tasks are blocked on dependencies).

3. **Start.** Read the task file fully. Set `status: in_progress` in its frontmatter.

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

8. **Update the task file.** Fill in the Implementation Log with both commit shas and the `test_command` output summary. Set `status: in_review`.

9. **Review.** Launch a `feature-dev:code-reviewer` agent (the same subagent `/feature-dev` uses in its Phase 6 — do NOT use the `/code-review` slash command, which is GitHub-PR-only and has no path for a local diff) over the working diff between the red and green commits. Append its findings verbatim to the task file's Review Notes section.

10. **Stop.** Report the diff and the review findings to the user. Do not start another task, even if more are `approved` and unblocked — that's a separate `/implement-task` invocation.
