---
description: Scan done tasks for environment/tooling gaps, workflow drift, and recurring Claude mistakes; propose concrete fixes to docs, rules, commands, or new tasks
argument-hint: [optional: task id or range to scope the scan, e.g. "010-013"]
---

# Retrospective

Scope: $ARGUMENTS

Read every `done` task's full history (not just its current acceptance criteria) looking for things worth fixing in the environment, the workflow harness, or a recurring pattern in how tasks get implemented — then propose fixes. This command only reports and recommends; it does not edit anything itself without the user picking what to act on next, same as a normal `/plan-task` -> `/implement-task` pass would.

## Steps

1. **Guard.** Run `pnpm tasks:status`. If a task is `in_progress` or `in_review`, note it but don't block on it — retro reads history, it doesn't touch the in-flight task's branch. Do check `git status` is clean on `main` before proposing any direct edits later, since some fixes from this pass may land as direct commits (harness/docs) rather than through `/plan-task`.

2. **Gather.** Read every `tasks/*.md` with `status: done` (scoped to the id/range in `$ARGUMENTS` if given, otherwise all of them). For each, pull out:
   - **Implementation Log** — anything phrased as a gotcha, workaround, "known caveat, not fixed by this task," "not exercised," or a deviation from the Plan mentioned inline (older tasks, before the Plan Deviations section existed, only have this).
   - **Plan Deviations** (tasks that have it) — read literally; this is Claude's own self-report of where it drifted, guessed wrong, or got corrected mid-task.
   - **Review Notes** — every finding, not just "Important"/high-confidence ones. Below-threshold and "checked and ruled out" notes often surface the same gap in the next task if nobody looks across tasks at once — that cross-task view is what this command adds over a single task's own review.

3. **Categorize** everything gathered into buckets:
   - **Environment/tooling** — local dev setup, Docker, CI (or its absence), lint/build/test wiring, scripts.
   - **Workflow/process** — the `/plan-task` / `/implement-task` commands themselves, the task template, the review loop.
   - **Recurring code/convention drift** — the same category of review finding (e.g. missing error handling, missing tests for an error path) showing up in more than one task, which suggests a `.claude/rules/*.md` convention is missing rather than each instance being an isolated bug.
   - **Plan-vs-actual drift** — patterns across multiple tasks' Plan Deviations (e.g. version pins guessed wrong, scope repeatedly creeping past the Plan, the same kind of assumption needing user correction) that suggest `/plan-task` should ask different questions upfront, not just that one task went sideways.

4. **Verify before reporting.** For every candidate issue, check it's still real against the *current* repo state (grep for the file/function/config named, read the current version) — don't report something a later task or a prior direct fix already resolved. This step is what makes the report trustworthy; skipping it just reproduces stale history.

5. **Report.** Present findings grouped by the four buckets above. For each surviving issue: what's open, why it matters (concrete failure scenario, not just "this is untidy"), and a specific proposed fix (file + what changes). Separate genuinely quick/contained fixes (config tweaks, doc updates, a small guarded bug fix) from ones that need a proper `/plan-task` pass (new behavior, anything touching more than a couple of files, anything the user should scope before committing to).

6. **Ask, don't apply.** Ask the user which findings to act on now. Route "quick fix" items to direct edits (mirroring how the last retro's fixes landed as direct commits on `main`, since they don't carry app-behavior risk needing a branch/PR) and "needs scoping" items to `/plan-task`. Do not silently fix everything found — some of what turns up may be intentional and just under-documented.
