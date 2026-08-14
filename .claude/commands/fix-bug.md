---
description: Fix a described bug directly on the current branch — explore, find root cause, TDD (failing test first), fix, rerun. No task file, no branch, no PR; leaves the diff for manual review/commit.
argument-hint: <bug description>
---

# Fix Bug

Bug report: $ARGUMENTS

This is the ad-hoc "quick fix" flow from `CLAUDE.md` — for an actual bug (wrong behavior), not a cosmetic or non-behavioral change. Use `/quick-change` for that instead.

## Steps

1. **Explore** the relevant code to understand what's actually there and how the described behavior happens.
2. **Find the root cause.** Don't patch a symptom before you know why it happens.
3. **Red.** Write a test that reproduces the wrong behavior. Run it and confirm it fails for the expected reason (the assertion you just wrote, not a config/syntax error).
4. **Green.** Fix the code with the smallest change that addresses the root cause. Rerun the test — and the surrounding suite where relevant — until everything passes.
5. **Report** the root cause and the fix in a couple of sentences.

Do **not** create a task file, branch, or PR, and do **not** commit. Leave the diff (test + fix) in the working tree for the user to review with `git diff` and commit themselves.
