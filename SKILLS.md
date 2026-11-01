# QRoute – Agent Rules and Skill Usage

## 1. Purpose

This file defines the mandatory development rules, skill-selection guidelines, and working procedures for AI coding agents working on QRoute.

All agents must read and follow this document before performing development tasks.

The available skills are located in:

`.agents/skills/`

Use the existing skills whenever they are relevant. Do not assume that every installed skill must be used for every task.

---

## 2. Instruction Priority

Follow this priority when making decisions:

1. Explicit user instructions and approvals.
2. Security requirements and restrictions established for QRoute.
3. This `SKILLS.md` project rulebook.
4. Relevant instructions inside the selected skill files.
5. Existing project architecture and established coding conventions.
6. General development best practices.

If instructions conflict, stop and explain the conflict rather than silently choosing an approach that could compromise security or existing functionality.

Never interpret permission to implement a feature as permission to make unrelated architectural or security changes.

---

## 3. Mandatory Development Principles

### 3.1 Investigate Before Editing

Before modifying anything:

- Inspect the relevant files and existing implementation.
- Understand how the affected feature communicates with other components.
- Identify existing utilities, hooks, middleware, services, and reusable components.
- Check whether the requested functionality already exists.
- Identify possible side effects and dependencies.
- Establish the root cause before attempting to fix a bug.

Do not immediately rewrite existing code or replace working implementations.

### 3.2 Minimal and Targeted Changes

- Prefer the smallest reliable modification.
- Preserve existing functionality, layouts, routes, and user workflows.
- Avoid unnecessary dependencies.
- Avoid duplicating existing logic.
- Do not refactor unrelated files.
- Do not replace established architecture without a clear technical reason.
- Preserve existing naming conventions unless there is a justified reason to change them.

### 3.3 Explain Before Major Changes

Before introducing any of the following, explain the proposal:

- New technologies or frameworks.
- New dependencies or infrastructure.
- Database schema changes.
- Authentication or authorization changes.
- RLS policy changes.
- Major architectural changes.
- Destructive operations or data migrations.

For substantial or potentially risky changes, provide an implementation plan and wait for explicit approval.

### 3.4 Beginner-Friendly Explanations

The project owner is learning software development.

When completing tasks:

- Explain the purpose of important changes.
- Explain why a particular technology or implementation was selected.
- Describe relevant backend, frontend, and database interactions.
- Explain unfamiliar technical concepts in understandable terms.
- Identify important trade-offs.
- Do not overwhelm the user with unnecessary technical details.

Prefer teaching the underlying concepts instead of simply delivering code.

---

## 4. Security Rules – Highest Priority

### 4.1 Authentication and Authorization

- Preserve the existing authentication implementation.
- Reuse existing authentication middleware, including `requireAuth`, where applicable.
- Do not introduce a duplicate authentication system.
- Keep authentication and authorization separate.
- Verify user roles before allowing restricted operations.
- Do not assume authentication automatically grants administrative permissions.
- Preserve existing role-based access control.

### 4.2 Supabase Row Level Security

RLS is a critical security boundary in QRoute.

- Never disable RLS as a quick fix.
- Never bypass RLS to simplify frontend or backend operations.
- Preserve existing ownership restrictions.
- Preserve role-based database permissions.
- Verify INSERT, SELECT, UPDATE, and DELETE policies when modifying database operations.
- Consider both INSERT and UPDATE policies when implementing upserts.
- Do not expose records that users are not authorized to access.
- Explain any proposed RLS policy modification before applying it.

### 4.3 Credentials and Environment Variables

- Never expose API keys, passwords, tokens, or service-role credentials.
- Never display secret values in terminal output, logs, documentation, or responses.
- Do not read or modify `.env`, `.env.local`, or other sensitive environment files unless explicitly authorized.
- Never place service-role credentials in frontend code.
- Use existing configured clients and authentication mechanisms.
- Never use privileged credentials to bypass user-level authorization.

### 4.4 Database Safety

- Inspect existing schemas, relationships, constraints, indexes, and policies before modifying the database.
- Prefer migrations and reversible changes.
- Do not execute destructive SQL without explicit approval.
- Never assume sample data represents the entire production database.
- Preserve existing records unless deletion is explicitly requested.
- Verify foreign keys and database constraints.
- Avoid duplicate tables or redundant columns.

---

## 5. Skill Selection and Usage

Skills are available under `.agents/skills/`.

Before performing a task:

1. Read `.agents/skills/using-superpowers/SKILL.md` at task start.
2. Read this `SKILLS.md` rulebook.
3. Identify the task type and select relevant installed skills.
4. Read each selected skill's `SKILL.md` before using its workflow.
5. Follow higher-priority system and user instructions if they conflict with a skill.
6. Combine skills when they add complementary guidance; skip unrelated skills.

### 5.1 Investigation and Planning

Use these skills when appropriate:

- `investigate-first` – Diagnose ambiguous failures before editing, using evidence-ranked explanations.
- `caveman-discover` – Inventory and label LLM workflows for Caveman Cloud. It is not a general project-structure discovery skill.
- `caveman-explore` – Read-only repository orientation and cross-file localization; it returns path and line references.
- `brainstorming` – Explore and agree on a design before creative work or new behavior.
- `diagnosing-superpowers` – Explain problems in a superpowers session, such as ignored plans or repeated work.
- `systematic-debugging` – Trace bugs, test failures, and unexpected behavior to a root cause before fixing them.
- `dispatching-parallel-agents` – Delegate two or more independent tasks when their work has no shared state or sequential dependency, and when delegation is allowed.

### 5.2 Implementation

Use these skills when appropriate:

- `executing-plans` – Execute an approved plan inline, task by task.
- `subagent-driven-development` – Execute a plan by assigning independent tasks to agents, when delegation is allowed.
- `surgical-patch` – Fix a bug or small behavior issue at its narrowest responsible layer.
- `safe-refactor` – Restructure code while bracketing the change with behavior checks.
- `test-driven-development` – Write and run a failing test before implementation, then verify the fix and refactor.
- `lean-build` – Keep a feature or integration focused when it risks growing beyond its intended scope.

### 5.3 Review and Verification

Use these skills when appropriate:

- `caveman-review` – Produce a concise code review with a location, problem, and fix for each finding.
- `receiving-code-review` – Verify review feedback before deciding whether to apply it.
- `requesting-code-review` – Request an independent review after substantial work or before merging.
- `caveman-evidence-review` – Read-only review of Caveman Cloud metrics and traces; it is not a general project verification skill.
- `verification-before-completion` – Gather evidence before claiming a change works or is complete.
- `verify-and-stop` – Check existing work against acceptance conditions without expanding scope.
- `finishing-a-development-branch` – After tests pass, choose how to integrate or retain the branch and clean up as authorized.

### 5.4 Documentation and Learning

Use these skills when appropriate:

- `caveman-learn` – Review a Caveman learn report and propose token-cost reductions; its instructions require per-edit consent.
- `caveman-help` – Show the quick reference for Caveman modes and commands.
- `caveman-compress` – Compress a memory file while preserving a readable backup.
- `stop-slop` – Remove predictable AI writing patterns from prose.
- `defuddle` – Extract readable Markdown from HTML pages with the Defuddle CLI.
- `writing-plans` – Turn a specification into an actionable implementation plan before code changes.
- `writing-skills` – Create, edit, or verify reusable skill documentation; follow its own required workflow.

### 5.5 Git and Project Management

Use these skills when appropriate:

- `caveman-commit` – Write a Conventional Commit message; it does not create a commit.
- `caveman-manage` – Inspect Caveman Cloud experiment evidence and block unsafe lifecycle actions. The current workflow does not execute lifecycle mutations.
- `caveman-setup` – Wire LLM call sites through the Caveman Cloud gateway for usage measurement; follow its credential and approval requirements.
- `caveman-stats` – Report supported current-session token usage or direct the user to the host's native usage report; do not infer savings.
- `using-git-worktrees` – Create or select an isolated worktree when feature work needs one.

Do not create commits, push changes, or perform destructive Git operations without appropriate authorization.

### 5.6 Other Specialized Skills

The following skills may be used when their specific functionality is relevant:

- `migration` – Plan and implement reversible, compatibility-safe transitions.
- `knap` – Render Markdown from templates and structured data with the Knap CLI.
- `cavecrew` – Route code-location, small-build, or review tasks through its documented Cavecrew delegation workflow when that workflow is available and allowed.
- `caveman`, `megacave`, and `ultracave` – Apply their requested persistent compressed response styles; preserve technical terms and follow each mode's activation and stop rules.
- `caveman-optimize` – Evaluate a Caveman optimization observation and prepare a paired candidate evaluation after the operator chooses; it is not generic performance tuning.
- `obsidian-bases`, `obsidian-cli`, and `obsidian-markdown` – Work with Obsidian Bases, the Obsidian CLI, and Obsidian-specific Markdown respectively.
- `json-canvas` – Create or edit Obsidian JSON Canvas files.
- `using-superpowers` – Apply the repository's Superpowers skill-discovery and workflow conventions where relevant.

Read each skill's instructions before invoking its workflow. Do not infer capabilities from its name alone.

---

## 6. QRoute Technical Guidelines

### 6.1 Frontend

- Use the existing React and TypeScript architecture.
- Preserve current page structure and navigation.
- Reuse existing components and hooks.
- Avoid unnecessary state duplication.
- Handle loading, error, and empty states.
- Keep frontend validation consistent with backend validation.
- Never treat frontend validation as a replacement for server-side authorization.

### 6.2 Backend

- Follow the existing Express architecture.
- Reuse existing middleware and API utilities.
- Validate incoming request parameters and payloads.
- Return consistent API response formats.
- Handle errors without exposing sensitive internal details.
- Keep business logic separate from route handlers where appropriate.
- Ensure database operations respect the authenticated user's permissions.

### 6.3 Supabase

- Inspect the actual database schema before writing SQL.
- Preserve existing table relationships and constraints.
- Use migrations for schema changes.
- Apply RLS to tables containing protected information.
- Verify database permissions after schema changes.
- Use authenticated user-scoped operations whenever appropriate.
- Keep database records as the source of truth.

### 6.4 Realtime

- Use Supabase Realtime when it fits the existing architecture.
- Treat notifications as signals, not authoritative database records.
- Prevent duplicate event processing.
- Handle out-of-order events and reconnections.
- Retrieve canonical data when necessary.
- Do not expose private user information in Broadcast payloads.
- Preserve authentication and authorization for private channels.

---

## 7. Required Development Workflow

For normal development tasks:

1. **Understand** – Read this document and relevant skill instructions.
2. **Investigate** – Inspect the existing implementation.
3. **Diagnose** – Identify the actual issue or requirement.
4. **Plan** – Propose the smallest appropriate solution.
5. **Approve** – Wait for approval when the change is substantial or security-sensitive.
6. **Implement** – Make targeted changes.
7. **Verify** – Run relevant tests, checks, and builds.
8. **Review** – Check for regressions, security issues, and unnecessary modifications.
9. **Explain** – Summarize the implementation in beginner-friendly terms.

For small, low-risk tasks, these steps may be combined. Do not skip investigation or verification.

---

## 8. Testing and Verification

- Test the actual affected functionality.
- Verify both successful and unsuccessful cases.
- Test authorization boundaries.
- Test database constraints and RLS behavior when relevant.
- Check browser console and backend logs.
- Run available type checks and build commands.
- Avoid claiming something works unless it has been verified.
- Clearly identify anything that could not be tested.

For database and authentication changes, include tests for unauthorized users and users with different roles.

---

## 9. Final Response Requirements

After completing a task, report:

1. What was changed.
2. Why the changes were necessary.
3. Which files or database objects were affected.
4. Which skills were used and why.
5. What tests or verification were performed.
6. Any remaining limitations or concerns.

Keep explanations clear and concise, but provide enough technical detail for the project owner to understand the implementation.

---

## 10. Continuous Improvement

Update this document when:

- A permanent architectural convention is established.
- A new security requirement is introduced.
- A recurring implementation mistake is discovered.
- A new technology becomes part of the project.
- The project owner explicitly requests a change to development rules.

Do not modify this document for temporary task-specific instructions.

When updating it:

- Preserve existing useful rules.
- Avoid duplicate instructions.
- Explain important changes.
- Distinguish confirmed project conventions from proposed improvements.

**Final rule: Protect the existing project first, understand before changing, implement only what is necessary, and explain what you do.**
