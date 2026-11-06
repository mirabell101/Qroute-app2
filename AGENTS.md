# AGENTS.md — Project Development and AI Agent Operating Guide

## 1. Purpose and General Rules

This document defines how AI coding agents must investigate, plan, implement, test, and review changes in this project.

The primary objectives are:

1. Utilize the project's available AI skills, workflows, and development resources.
2. Reuse existing implementations instead of unnecessarily rebuilding them.
3. Preserve existing application architecture and functionality.
4. Prioritize security, reliability, and maintainability.
5. Make small, controlled, and verifiable changes.
6. Avoid unnecessary dependencies, database operations, and refactoring.

Agents must treat the existing project as an established application, not as a blank project.

**Default approach: Investigate first, plan second, implement third, verify last.**

---

## 2. Mandatory Resource Discovery

At the beginning of every development task, discover the available development resources before modifying code.

### 2.1 Superpowers and Skill Instructions

Mandatory reading order:

1. Read `.agents/skills/using-superpowers/SKILL.md` completely.
2. Read the root `SKILLS.md` completely.
3. Review the available skill descriptions and identify relevant skills.
4. Read the complete `SKILL.md` for every relevant skill.
5. Follow the selected skills throughout the task.

Do not assume a skill exists simply because it appears in a previous conversation, documentation, or an AI-generated recommendation.

Verify its actual directory and instructions.

### 2.2 Discover All Available Skills

Inspect the available skill directories, especially:

- `.agents/skills/`
- Any additional skill directories explicitly referenced by `SKILLS.md`.
- Skills provided by installed integrations or tools, when accessible.

Create an understanding of the available skills and their intended purposes.

Select skills based on the requested task.

Examples:

| Task | Relevant skill categories |
|---|---|
| Debugging | Systematic debugging, investigate-first |
| New feature | Planning, implementation, testing |
| UI changes | Frontend design, accessibility, component architecture |
| React/TypeScript | React patterns, TypeScript, code quality |
| Express backend | API design, middleware, backend architecture |
| Supabase | Supabase development, database security |
| SQL optimization | Postgres best practices, query optimization |
| Authentication | Authentication, authorization, security |
| Refactoring | Refactoring, surgical patch |
| Database migration | Migration planning, database safety |
| Code review | Code review, security review, testing |

These are examples, not a fixed list. Use the actual installed skills and their instructions.

**Do not read every skill's complete instructions for every task.** Discover all available skills, then read the complete instructions for those relevant to the current task.

### 2.3 Skill Usage Requirements

- Do not merely read a skill and ignore its workflow.
- Apply its recommended procedures where relevant.
- Follow required sub-skills and dependencies.
- Respect the order of operations specified by the skill.
- If multiple skills apply, combine them without duplicating work.
- If skill instructions conflict, follow higher-priority instructions and explain the conflict when it affects implementation.
- Do not invent skill capabilities or claim that a skill was used when it was not.

If a required skill is unavailable, report the limitation.

---

## 3. AiderDesk and Additional AI Development Resources

AiderDesk is part of the project's available AI-assisted development resources and must be considered during development.

### 3.1 Discover the AiderDesk Resources

At the beginning of a task:

1. Inspect the project root for the actual AiderDesk-related folder and configuration.
2. Look for folders or files named `aiderdesk`, `.aiderdesk`, or other documented AiderDesk resource locations.
3. Inspect available documentation, configuration, agent instructions, workflows, and task-related resources.
4. Identify whether AiderDesk provides relevant prompts, workflows, sub-agents, tools, or project context.
5. Use the available resources when they materially help the requested task.

Do not assume a particular directory structure. Discover the actual installed structure first.

### 3.2 AiderDesk Usage

When applicable:

- Use existing AiderDesk workflows instead of recreating equivalent workflows.
- Reuse relevant project instructions and agent configurations.
- Use specialized agents or workflows when they provide a clear benefit.
- Use investigation, planning, implementation, and review capabilities as appropriate.
- Preserve existing AiderDesk configurations.
- Do not overwrite or modify its configuration without authorization.
- Do not execute unknown scripts or commands merely because they appear in a configuration file.

If AiderDesk is unavailable in the current environment, continue with the available skills and report the limitation.

### 3.3 Resource Coordination

Avoid running multiple agents or workflows that perform the same task independently.

When using multiple agents:

- Give each a clearly defined responsibility.
- Avoid simultaneous edits to the same files.
- Establish which agent owns implementation.
- Use independent agents for investigation, testing, or review when beneficial.
- Consolidate findings before making changes.

AiderDesk and the installed skills should complement each other, not create unnecessary complexity.

---

## 4. Task Assessment and Planning

Before implementation, classify the requested task.

Determine whether it involves:

- Frontend/UI.
- React or TypeScript.
- Backend/Express.
- API integration.
- Supabase/database.
- Authentication and authorization.
- Map and geolocation functionality.
- Testing or debugging.
- Infrastructure or deployment.
- Multiple interconnected areas.

For tasks involving multiple systems, trace the complete data flow before making changes.

Example:

`React Page → API Client → Express Route → Middleware → Controller/Service → Supabase`

Identify:

1. The current implementation.
2. The intended behavior.
3. The missing or malfunctioning part.
4. Existing reusable functions and components.
5. Files that genuinely require modification.
6. Potential security and regression risks.
7. Relevant tests.

### Planning Requirements

For small fixes, use a concise implementation plan.

For complex features, migrations, or cross-system changes, create a more detailed plan before implementation.

Use the applicable planning or execution skill when required.

Do not implement unrelated improvements simply because they are discovered during investigation.

---

## 5. Investigation Before Implementation

Before changing code:

- Inspect the relevant files and project structure.
- Read the existing implementation completely enough to understand its behavior.
- Check related components, hooks, utilities, API clients, and backend endpoints.
- Inspect existing tests.
- Search for reusable implementations.
- Understand the existing authentication and authorization flow.
- Check the current database schema and relationships when relevant.
- Check Git status and existing uncommitted changes.

Do not overwrite existing user changes.

Do not assume that an apparent bug originates in the file where it appears.

Trace the actual source of the problem.

### Debugging Requirements

When fixing bugs:

1. Reproduce or understand the reported failure.
2. Identify the root cause.
3. Distinguish symptoms from underlying causes.
4. Apply the smallest appropriate fix.
5. Add or update regression coverage where justified.
6. Verify that the original issue is resolved.

Do not suppress errors, disable checks, or introduce workarounds without understanding the cause.

---

## 6. Minimal and Controlled Implementation

- Make the smallest changes necessary.
- Preserve existing functionality and architecture.
- Follow existing naming conventions and code organization.
- Reuse existing components, hooks, utilities, and services.
- Avoid duplicate implementations.
- Avoid unnecessary dependencies.
- Avoid unrelated refactoring.
- Preserve existing UI design unless a redesign is explicitly requested.
- Preserve existing routes and navigation unless a routing change is required.
- Do not replace an existing working system merely because another implementation is more convenient.

When a broader refactor appears necessary, explain why and request approval before proceeding.

---

## 7. Frontend Development Standards

For React and TypeScript:

- Reuse existing components and hooks.
- Keep component responsibilities clear.
- Avoid unnecessary global state.
- Use appropriate TypeScript types.
- Avoid `any` unless there is a justified and documented reason.
- Do not suppress errors using `@ts-ignore` or similar workarounds.
- Preserve existing responsive behavior.
- Handle loading, error, empty, and success states.
- Avoid duplicate API requests.
- Prevent stale data and account information from leaking between users.
- Clean up subscriptions and effects appropriately.
- Preserve existing accessibility and interaction behavior.

For UI changes, inspect the current page before modifying its design.

If the user says to preserve the existing page, treat its current layout and behavior as requirements.

---

## 8. Backend and API Development Standards

For Express and backend development:

- Reuse existing middleware, routes, controllers, and services.
- Keep business logic in the backend.
- Validate incoming requests.
- Use consistent response structures.
- Handle expected errors explicitly.
- Avoid unnecessary endpoints.
- Avoid duplicate database queries.
- Do not trust frontend-supplied identity or role information.
- Use the existing authenticated request context.
- Do not expose internal errors, secrets, or sensitive records.

Do not introduce a second authentication or authorization system when an existing one is available.

---

## 9. Supabase, Database, and Security Requirements

Database security is a priority.

### 9.1 RLS and Authorization

- Preserve existing RLS policies.
- Never disable or weaken RLS to resolve application errors.
- Never bypass authorization checks for convenience.
- Preserve existing RBAC rules.
- Never expose service-role credentials to frontend code.
- Never trust frontend-supplied user IDs or roles.
- Derive authenticated identity from verified authentication context.
- Apply least-privilege access.

### 9.2 Database Changes

Before proposing database changes:

1. Inspect the existing schema.
2. Inspect table relationships and constraints.
3. Inspect relevant indexes.
4. Inspect existing grants and RLS policies.
5. Identify potential effects on other features.
6. Explain the proposed change and its security implications.

Requirements:

- Never edit an already applied migration.
- Create new timestamped migrations for approved schema changes.
- Do not make destructive changes without explicit approval.
- Do not modify unrelated policies or privileges.
- Do not apply remote database changes without authorization.
- Verify remote migration results when remote application is requested.
- Keep migration files and actual database state consistent.

If a task can be solved safely using existing tables, policies, and endpoints, prefer that approach.

### 9.3 Database Performance

- Avoid N+1 queries.
- Prefer batch operations when appropriate.
- Retrieve only necessary fields.
- Use pagination for large collections.
- Avoid unnecessary polling and realtime subscriptions.
- Reuse existing caches where appropriate.
- Avoid duplicate requests caused by multiple component instances.
- Do not introduce additional database traffic without a clear purpose.

### 9.4 Sensitive Information

Never expose:

- Passwords.
- API keys.
- Access or refresh tokens.
- Service-role keys.
- Private environment variables.
- Sensitive personal information.

Follow task-specific restrictions on environment files. If the user prohibits reading `.env` files, do not access them.

---

## 10. Approval and Change Boundaries

Proceed with ordinary implementation changes within the requested scope.

Request explicit approval before:

- Destructive database operations.
- Changes to existing RLS policies.
- Changes to RBAC or authentication architecture.
- New security privileges or grants.
- Production or remote database changes not explicitly authorized.
- Introducing significant new dependencies.
- Large architectural changes.
- Replacing existing systems.
- Changes that may affect unrelated features or users.

If the user explicitly authorizes a specific operation, perform only that authorized operation.

Do not interpret permission for one database change as permission to modify unrelated policies, tables, or privileges.

If an implementation conflicts with existing security or architecture, explain the conflict and propose a safe alternative.

---

## 11. Testing and Verification

Testing must match the scope and risk of the task.

### 11.1 Test Strategy

- Inspect existing test commands and configurations.
- Reuse the project's current test framework.
- Run focused tests first.
- Run related regression tests.
- Run the production build.
- Run lint and type checks when available.
- Verify backend startup when backend code or dependencies change.
- Verify database behavior when database-related functionality changes.

Do not claim tests passed unless they were actually executed successfully.

Distinguish between:

- Tests passed.
- Tests failed.
- Tests not run.
- Tests blocked by unavailable services or configuration.

### 11.2 Test File Cleanup

Remove temporary test files, debugging scripts, disposable test data, and artifacts created solely during the current task once they are no longer needed.

Rules:

- Do not leave unnecessary `.tmp`, `.log`, scratch scripts, experimental components, or one-off debugging files.
- Remove obsolete or redundant tests only when their coverage is preserved.
- Do not delete permanent regression tests.
- Do not delete existing fixtures, mocks, or test configurations.
- Do not delete unrelated tests.
- Do not delete failing tests merely to obtain a passing test suite.
- Investigate failures and preserve useful coverage.
- Re-run relevant tests and builds after cleanup.
- Report every deleted test or temporary file and explain why.

---

## 12. Code Review and Regression Prevention

Before completing a task:

- Review the full Git diff.
- Check for unintended file modifications.
- Check for accidental changes to configuration.
- Check for exposed secrets or sensitive data.
- Check for weakened authentication or authorization.
- Check for duplicate code or unnecessary dependencies.
- Check for broken imports and TypeScript errors.
- Check for regressions in related features.
- Verify that the implementation satisfies the original request.

When appropriate, use a relevant code-review or security-review skill.

Do not assume that a successful build proves that the feature works correctly.

---

## 13. Documentation and Project Knowledge

Keep documentation consistent with actual implementation.

When relevant:

- Update existing documentation instead of creating duplicates.
- Document new API endpoints.
- Document important architecture changes.
- Document new environment variable names without exposing their values.
- Document database migrations and their purpose.
- Preserve existing project instructions.
- Avoid unnecessary documentation files for trivial fixes.

Do not claim that a feature is implemented if only its documentation has been created.

---

## 14. Final Report Requirements

Every completed task must provide a concise but informative report.

Include:

1. **Summary:** What was fixed or implemented.
2. **Root cause:** For debugging tasks, explain the actual cause.
3. **Files changed:** Files created, modified, or deleted.
4. **Skills utilized:** List the skills actually read and applied.
5. **AiderDesk resources:** Identify relevant resources used, or state if none were available or applicable.
6. **Testing:** Commands executed and actual results.
7. **Security:** Any authentication, authorization, RLS, or database changes.
8. **Cleanup:** Temporary files and tests removed.
9. **Limitations:** Anything that remains unresolved.
10. **Follow-up:** Only recommend additional work that is genuinely necessary.

Never fabricate test results, skill usage, database changes, or successful deployment.

---

## 15. Instruction Priority

Follow instructions in this priority order:

1. System and platform instructions.
2. Explicit user instructions for the current task.
3. This `AGENTS.md`.
4. Relevant skill instructions and project documentation.
5. Existing coding conventions and implementation preferences.

When instructions conflict:

- Follow the higher-priority instruction.
- Preserve security requirements.
- Explain relevant conflicts.
- Ask for clarification when the intended behavior cannot be determined safely.

Task-specific user instructions override general project preferences only within the authorized scope.

---

## 16. Core Development Philosophy

Every agent working on this project must follow these principles:

- Investigate before modifying.
- Understand before replacing.
- Reuse before recreating.
- Plan before complex implementation.
- Apply skills rather than merely reading them.
- Use AiderDesk resources when relevant and available.
- Prefer minimal, surgical changes.
- Preserve existing behavior.
- Prioritize database and application security.
- Test actual behavior.
- Clean up temporary artifacts.
- Report honestly.

**The objective is not to produce the most code. The objective is to make the correct change while preserving everything that already works.**