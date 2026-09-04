---
description: Turn an idea into one or more approved task files under tasks/, reusing feature-dev's explore/design agents
argument-hint: [idea or task description]
---

# Plan Task

Idea: $ARGUMENTS

Turn this idea into one or more small, sequentially-executed task files under `tasks/`, approved by the user before anything is written. Reuse the `feature-dev` plugin's existing subagents for exploration and design — do not write new exploration/design prompts from scratch.

## Steps

1. **Orient.** Read `CLAUDE.md` and `docs/architecture.md`. Run `pnpm tasks:status` (`scripts/task-status.mjs`) to get the id/status/title of every existing task, including its `Done:` section — this is computed from frontmatter, not scanned by eye, and gives you the highest existing id (for numbering the new task) plus what's already shipped, in flight, or approved (to avoid re-proposing covered work). Git history is authoritative for what already shipped, so don't re-read the full body of `done` tasks.

2. **Explore.** Launch 1-3 `feature-dev:code-explorer` agents in parallel to understand relevant existing code, patterns, and integration points for this idea. Use 1 agent for a small, well-scoped idea; use up to 3 with different focuses (similar features, architecture, testing/extension points) when the scope is broader or uncertain.

3. **Clarify.** Identify anything underspecified — edge cases, scope boundaries, integration details. Ask the user directly (via `AskUserQuestion` or plain questions) and wait for answers before designing. Don't skip this even for small ideas; if the user says "whatever you think is best," give a recommendation and get explicit confirmation.

4. **Design.** Launch `feature-dev:code-architect` agent(s) for the implementation approach. One agent is enough when the approach is obvious; use 2-3 in parallel with different trade-off focuses (minimal change, clean architecture, pragmatic balance) only when the approach is genuinely ambiguous.

5. **Break into tasks.** Split the approved approach into small, independently reviewable tasks. Each task should be TDD-able on its own (a meaningful unit of behavior, not a scaffolding/config step — those are handled outside this loop). Chain dependencies with `depends_on`. Tasks are always executed strictly one at a time regardless of any `parallelizable_with` note — that field is informational only.

6. **Get approval.** Present the plan (goal, approach, files touched, task breakdown) through the normal plan-mode flow and call `ExitPlanMode`. Do not write anything to `tasks/` before approval.

7. **Write task files.** On approval, create one file per task in `tasks/`, numbered after the current highest `id`, copying the structure of `tasks/TEMPLATE.md`. Fill in `title`, `depends_on`, `tdd`, `test_command`, `created`, and the Goal/Acceptance Criteria/Plan sections. Set `status: approved`. Leave Implementation Log and Review Notes empty. Do not implement anything — that's `/implement-task`'s job.

   The Plan section should carry what `/implement-task` can't cheaply re-derive on its own: decisions and why (chosen approach over the alternatives considered), findings from exploration (library/API constraints, cost or perf numbers, existing-code gotchas), and interface-level shapes — function signatures, endpoint request/response shapes, data model changes, the list of files touched. Don't write full implementation bodies (a complete route handler, a component's full internals) — describe the shape and behavior instead and let `/implement-task` write the body test-first. A fully-written body invites pasting it in without real red/green, and it can only be a guess at code that hasn't been run against the actual environment yet. Where a detail can't be confirmed without running code (e.g. a third-party API's exact response envelope), say so explicitly and name what to verify first — don't paper over the gap with speculative code.

8. **Write the epic, if there's more than one task.** A multi-task plan has a "why these tasks are one thing" narrative that no single task file can hold on its own — don't let it live only in the plan-mode conversation. Write `tasks/epics/<slug>.md` (kebab-case slug from the plan's title) containing the plan's Context section verbatim and a one-line-per-task list of member ids/titles — never a status field or progress list, that stays solely in each task's own frontmatter (`pnpm tasks:status` computes it live; a second tracker here would drift). Stamp `epic: <slug>` in every member task's frontmatter. A single-task plan leaves `epic:` blank and skips this step.
