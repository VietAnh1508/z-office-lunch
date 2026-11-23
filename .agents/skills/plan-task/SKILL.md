---
name: plan-task
description: >-
  Turn an idea into one or more approved task files under tasks/ (and an epic
  file under tasks/epics/ when splitting into multiple tasks). Use when the user
  wants to plan a new feature or task before implementing it.
---

# Plan Task

Turn an idea into one or more small, sequentially-executed task files under `tasks/`, approved by the user before anything is written.

## Steps

1. **Orient.** Read `AGENTS.md` and `docs/architecture.md`. Run `pnpm tasks:status` (`scripts/task-status.mjs`) to get the id/status/title of every existing task, including its `Done:` section — this is computed from frontmatter, not scanned by eye, and gives you the highest existing id (for numbering the new task) plus what's already shipped, in flight, or approved (to avoid re-proposing covered work). Git history is authoritative for what already shipped, so don't re-read the full body of `done` tasks.

2. **Explore.** Use parallel read-only research subagents (if your harness supports them, otherwise explore directly) to understand relevant existing code, patterns, and integration points for this idea. Use 1 pass for a small, well-scoped idea; split into up to 3 focuses (similar features, architecture, testing/extension points) when the scope is broader or uncertain.

3. **Clarify.** Identify anything underspecified — edge cases, scope boundaries, integration details. Ask the user directly and wait for answers before designing. Ask even for small ideas, because unstated assumptions are what plans most often get wrong; if the user says "whatever you think is best," give a recommendation and get explicit confirmation.

4. **Design.** Design the implementation approach. Consider trade-offs (minimal change, clean architecture, pragmatic balance) when the approach is genuinely ambiguous, and verify the proposed task split carefully because every later task builds on it.

5. **Break into tasks.** Split the approved approach into small, independently reviewable tasks. Each task should be TDD-able on its own (a meaningful unit of behavior, not a scaffolding/config step — those are handled outside this loop). Chain dependencies with `depends_on`. Tasks are always executed strictly one at a time regardless of any `parallelizable_with` note — that field is informational only.

6. **Get approval.** Present the plan (goal, approach, files touched, task breakdown) to the user and wait for explicit approval. Do not write anything to `tasks/` before approval.

7. **Write task files.** On approval, create one file per task in `tasks/`, numbered after the current highest `id`, copying the structure of `tasks/TEMPLATE.md`. Fill in `title`, `depends_on`, `tdd`, `test_command`, `created`, and the Goal/Acceptance Criteria/Plan sections. Set `status: approved`. Leave Implementation Log and Review Notes empty. Do not implement anything — that's `implement-task`'s job.

   The Plan section should carry what `implement-task` can't cheaply re-derive on its own: decisions and why (chosen approach over the alternatives considered), findings from exploration (library/API constraints, cost or perf numbers, existing-code gotchas), and interface-level shapes — function signatures, endpoint request/response shapes, data model changes, the list of files touched. Don't write full implementation bodies (a complete route handler, a component's full internals) — describe the shape and behavior instead and let `implement-task` write the body test-first. Where a detail can't be confirmed without running code (e.g. a third-party API's exact response envelope), say so explicitly and name what to verify first — don't paper over the gap with speculative code.

8. **Write the epic, if there's more than one task.** A multi-task plan has a "why these tasks are one thing" narrative that no single task file can hold on its own — don't let it live only in the conversation. Write `tasks/epics/<slug>.md` (kebab-case slug from the plan's title) containing the plan's Context section verbatim and a one-line-per-task list of member ids/titles — never a status field or progress list, that stays solely in each task's own frontmatter (`pnpm tasks:status` computes it live; a second tracker here would drift). Stamp `epic: <slug>` in every member task's frontmatter. A single-task plan leaves `epic:` blank and skips this step.
