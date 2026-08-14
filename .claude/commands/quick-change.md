---
description: Make a small, non-bug change (copy/label, config tweak, styling nit) directly on the current branch. No task file, no branch, no PR; leaves the diff for manual review/commit.
argument-hint: <what to change>
---

# Quick Change

Requested change: $ARGUMENTS

This is the ad-hoc "quick fix" flow from `CLAUDE.md` — for a small change that isn't fixing broken behavior. Use `/fix-bug` instead if this is actually a bug.

## Steps

1. **Explore** to find exactly where the change belongs.
2. **Implement** the smallest change that satisfies the request.
3. **Test.** Run the existing relevant tests to confirm nothing broke. Only add or update a test if the change affects behavior something asserts on — a pure copy/label/style change usually doesn't need a new one.
4. **Report** what changed in a sentence or two.

Do **not** create a task file, branch, or PR, and do **not** commit. Leave the diff in the working tree for the user to review with `git diff` and commit themselves.
