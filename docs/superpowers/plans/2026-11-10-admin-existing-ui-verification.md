# Admin Existing UI Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify that existing Admin read-only controls operate against real data without changing the frozen UI.

**Architecture:** Keep the existing React pages and `src/lib/adminApi.ts` client. Preserve Express admin authorization through `requireAuth` followed by `requireAdmin`; use current Supabase data sources only.

**Tech Stack:** React 19, TypeScript, Express 5, Supabase, Vitest.

**Spec:** User-approved strict-freeze design in the current conversation.

## Global Constraints

- Do not change, redesign, restyle, or rearrange the existing Admin UI.
- Do not add, remove, rename, or move existing controls.
- Every `/api/admin/*` endpoint must require `requireAuth` followed by `requireAdmin`.
- Derive administrator access from the `user_roles` database table.
- Do not modify Google OAuth or password authentication.
- Do not create report schema or mutations for controls that are absent from the UI.

## Review Focus

- Unauthenticated requests to each existing admin endpoint must return 401; authenticated non-admin requests must return 403.
- Missing sessions or a changed active user must not issue a frontend API request.
- Database and malformed-response errors must be surfaced rather than converted to successful fallback data.
- Valid zero counts and empty collections must remain empty without fabricated records.
- Route stop ordering and nullable supported fields must be preserved; malformed payloads must be rejected.

---

### Task 1: Verify Existing Admin Read and Navigation Contracts

**Files:**
- Test: `server/routes/adminRoutes.test.ts`
- Test: `server/admin.test.ts`
- Test: `src/lib/adminApi.test.ts`
- Test: `src/pages/admin/adminNavigation.test.ts`

**Interfaces:**
- Consumes: Existing protected `/api/admin/summary`, `/api/admin/routes`, and `/api/admin/users` endpoints; existing community-post read API; current navigation destination map.
- Produces: Test evidence for the frozen, existing read-only workflows. No UI or database interface changes.

- [ ] **Step 1: Run the focused existing admin tests**

Run: `npx vitest run --config vitest.community.config.ts server/routes/adminRoutes.test.ts server/admin.test.ts src/lib/adminApi.test.ts src/pages/admin/adminNavigation.test.ts`

Expected: All selected tests pass, including authorization denials, valid and empty reads, malformed responses, surfaced errors, route stop order, and supported navigation destinations.

- [ ] **Step 2: Inspect any failure and make only a narrowly scoped correction**

If a selected test fails, trace the failing existing behavior and add or update a regression test in the owning test file before changing implementation. Do not add controls, destinations, schema, or functionality excluded by the approved freeze.

- [ ] **Step 3: Re-run the focused admin tests**

Run: `npx vitest run --config vitest.community.config.ts server/routes/adminRoutes.test.ts server/admin.test.ts src/lib/adminApi.test.ts src/pages/admin/adminNavigation.test.ts`

Expected: All selected tests pass.

### Task 2: Run the Requested Quality Gates

**Files:**
- Verify: TypeScript project
- Verify: Full Vitest suite
- Verify: Production build

**Interfaces:**
- Consumes: The code state verified by Task 1.
- Produces: Type-check, test-suite, and production-build results.

- [ ] **Step 1: Run the no-emit TypeScript check**

Run: `npx tsc --noEmit`

Expected: Exit code 0 and no TypeScript errors.

- [ ] **Step 2: Run all project tests**

Run: `npm test`

Expected: Exit code 0 and all tests pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Exit code 0 and successful production output.
