# Instructions for Coding Agents

## 1. Mandatory Skill-First Workflow

At the start of **every development task**, before investigating or modifying any code:

1. Read `.agents/skills/using-superpowers/SKILL.md` completely.
2. Read the root `SKILLS.md` completely.
3. Identify the skills relevant to the requested task using the available skill descriptions and instructions.
4. Read the complete `SKILL.md` file for every relevant skill located under `.agents/skills/<skill-name>/SKILL.md`.
5. Follow the applicable skill instructions throughout investigation, planning, implementation, testing, and code review.

Do not assume a skill is available simply because it is mentioned in documentation. Verify that its directory and instructions exist.

If a required skill cannot be found or read, report that limitation and continue only when it is reasonable to do so.

Do not skip this process for small fixes, debugging tasks, feature additions, refactoring, or database-related work.

## 2. Investigation Before Implementation

Before changing anything:

- Inspect the existing project structure and relevant implementation.
- Understand how the existing components, hooks, utilities, APIs, authentication, and database policies work together.
- Identify reusable functions and existing patterns before creating new ones.
- Check for existing implementations to avoid duplication.
- Identify possible regressions and dependencies.

Do not immediately rewrite existing code based on assumptions.

## 3. Minimal and Controlled Changes

- Make the smallest changes necessary to satisfy the requested task.
- Preserve existing functionality, architecture, UI behavior, and established coding conventions.
- Avoid unrelated refactoring, unnecessary dependencies, and duplicate implementations.
- Do not replace existing systems when extending them is sufficient.
- Do not modify unrelated files.

## 4. Database and Security Requirements

- Preserve existing Supabase RLS policies, authentication, authorization, and role restrictions.
- Never disable or weaken RLS to resolve an application issue.
- Never expose service-role credentials or other secrets to frontend code.
- Do not modify existing applied migrations. Create new timestamped migrations for approved schema changes.
- Inspect existing tables, relationships, grants, and policies before proposing database modifications.
- Do not apply destructive database changes or modify unrelated policies without explicit user approval.
- Prefer client-side storage for temporary user-specific data when appropriate, rather than unnecessarily increasing database traffic.

## 5. Approval and Communication

- Ask for approval before making changes outside the requested scope.
- Explain the reason and impact before introducing new dependencies, database migrations, architectural changes, or security-policy modifications.
- If an implementation requirement conflicts with existing architecture or security, explain the conflict before proceeding.
- Do not claim that a feature, migration, or test succeeded unless it was actually verified.

## 6. Testing and Final Review

Test File Cleanup Requirements

    Remove temporary test files, debugging scripts, disposable test data, and test artifacts created solely during the current task once they are no longer needed.

    Remove obsolete or redundant test files only when they are directly related to the requested changes and their removal is justified.

    Do not leave behind temporary files such as *.tmp, *.log, scratch scripts, experimental test components, or one-off debugging files.

    Do not delete existing permanent test suites, regression tests, fixtures, mocks, or test configuration simply to reduce the number of files.

    Preserve useful tests that verify existing functionality, security, database behavior, and previously fixed bugs.

    If a test file is no longer necessary because its coverage has been replaced, verify that equivalent or better coverage exists before removing it.

    Never delete test files or test data belonging to another feature or unrelated task.

    Do not remove test files merely because they fail. Investigate and fix them, or report why they cannot be fixed.

    After cleanup, rerun the relevant tests and production build to ensure no required test coverage or application functionality was lost.

    Include all deleted test files in the final report and explain why they were removed.

After implementation:

- Run relevant tests and the production build.
- Review the changed files for unintended modifications.
- Check for regressions in related features.
- Verify security-sensitive behavior where applicable.
- Report any tests that could not be performed.

Provide a concise final report containing:
1. Summary of changes.
2. Files created or modified.
3. Skills read and applied.
4. Tests and build results.
5. Database changes, if any.
6. Remaining limitations or recommended follow-up work.

## 7. Instruction Priority

Follow higher-priority system and user instructions whenever they conflict with project guidance.

Task-specific user requirements take precedence over general implementation preferences in this file, provided they do not conflict with higher-priority instructions.