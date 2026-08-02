---
id: 000
title: Short imperative title
status: proposed        # proposed | approved | in_progress | in_review | done
depends_on: []           # ids that must be status: done before this can start
parallelizable_with: []  # informational only; no command consumes this today — execution is always sequential
tdd: required            # required | exempt (exempt is only for one-time scaffolding done outside the /plan-task -> /implement-task loop)
test_command: ""
created: 2026-08-01
---

## Goal

One or two sentences: what this task delivers and why.

## Acceptance Criteria

- [ ] ...

## Plan

(Filled in by /plan-task before approval.)

## Implementation Log

(Filled in by /implement-task.)

- red commit: <sha> — `<test_command>` -> N failing
- green commit: <sha> — `<test_command>` -> all passing

## Plan Deviations

(Filled in by /implement-task, honestly, before requesting review — write "None." if genuinely nothing applies, don't skip this section silently.)

- Where did the actual implementation differ from the Plan above, and why?
- Any wrong assumption, dead end, or approach abandoned partway through?
- Anything the user had to correct or redirect mid-task?

## Review Notes

(Output of the feature-dev:code-reviewer agent, appended by /implement-task.)
