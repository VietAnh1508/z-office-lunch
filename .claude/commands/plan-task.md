---
description: Turn an idea into one or more approved task files under tasks/, reusing feature-dev's explore/design agents
argument-hint: [idea or task description]
---

# Plan Task

Idea: $ARGUMENTS

Turn this idea into one or more small, sequentially-executed task files under `tasks/`, approved by the user before anything is written. Reuse the `feature-dev` plugin's existing subagents for exploration and design — do not write new exploration/design prompts from scratch.

## Steps

1. **Orient.** Read `CLAUDE.md` and `docs/architecture.md`. Run `ls tasks/` and read only the frontmatter (`id`, `status`, `title`) of existing task files — git history is authoritative for what already shipped, don't re-read the full body of `done` tasks.

2. **Explore.** Launch 1-3 `feature-dev:code-explorer` agents in parallel to understand relevant existing code, patterns, and integration points for this idea. Use 1 agent for a small, well-scoped idea; use up to 3 with different focuses (similar features, architecture, testing/extension points) when the scope is broader or uncertain.

3. **Clarify.** Identify anything underspecified — edge cases, scope boundaries, integration details. Ask the user directly (via `AskUserQuestion` or plain questions) and wait for answers before designing. Don't skip this even for small ideas; if the user says "whatever you think is best," give a recommendation and get explicit confirmation.

4. **Design.** Launch `feature-dev:code-architect` agent(s) for the implementation approach. One agent is enough when the approach is obvious; use 2-3 in parallel with different trade-off focuses (minimal change, clean architecture, pragmatic balance) only when the approach is genuinely ambiguous.

5. **Break into tasks.** Split the approved approach into small, independently reviewable tasks. Each task should be TDD-able on its own (a meaningful unit of behavior, not a scaffolding/config step — those are handled outside this loop). Chain dependencies with `depends_on`. Tasks are always executed strictly one at a time regardless of any `parallelizable_with` note — that field is informational only.

6. **Get approval.** Present the plan (goal, approach, files touched, task breakdown) through the normal plan-mode flow and call `ExitPlanMode`. Do not write anything to `tasks/` before approval.

7. **Write task files.** On approval, create one file per task in `tasks/`, numbered after the current highest `id`, copying the structure of `tasks/TEMPLATE.md`. Fill in `title`, `depends_on`, `tdd`, `test_command`, `created`, and the Goal/Acceptance Criteria/Plan sections. Set `status: approved`. Leave Implementation Log and Review Notes empty. Do not implement anything — that's `/implement-task`'s job.
