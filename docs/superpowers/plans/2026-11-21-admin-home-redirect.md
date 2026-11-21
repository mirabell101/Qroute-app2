# Admin Home Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect an authenticated admin from `/home` to `/admin/base` while preserving all other homepage and shared-route behavior.

**Architecture:** Add a small role helper that identifies the one route-specific redirect. Use it only in the existing `/home` route after the established loading and visitor checks, leaving the shared user-page guard unchanged.

**Tech Stack:** React 19, React Router, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-admin-home-redirect-design.md`

## Global Constraints

- Read role from the existing database-backed role state; do not infer it from the client or identity metadata.
- Redirect only `admin` from `/home` to `/admin/base` with history replacement.
- Preserve administrator access to shared routes such as `/saved` and `/profile`.
- Do not modify authentication, authorization, RLS, APIs, or dependencies.

## Review Focus

- Role loading must complete before a redirect decision is made.
- Visitors must continue to receive the Landing page at `/home`.
- Registered users must continue to receive Home at `/home`.
- Moderators must not gain a new redirect or access path from this change.
- Shared registered-user routes must keep their existing admin access.

---

### Task 1: Add and use the `/home` admin redirect

**Files:**
- Modify: `src/lib/roles.ts`
- Modify: `src/lib/roles.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `homeRedirectPath(role: string | null | undefined): string | null`, returning `/admin/base` only for `admin`.
- Consumes: `currentUserRole` and existing `/home` route state in `App`.

- [ ] **Step 1: Write the failing role-helper regression test**

Assert that `homeRedirectPath("admin")` returns `/admin/base` and registered users, moderators, and unknown roles return `null`.

- [ ] **Step 2: Run the focused test and verify the missing helper causes failure**

Run: `npm test -- src/lib/roles.test.ts`

- [ ] **Step 3: Implement the minimal role helper and use it in the `/home` route**

Return the existing admin landing path only for `admin`; in `App`, render `<Navigate to={homeRedirectPath(currentUserRole)} replace />` only when the helper returns a path, after loading and visitor handling.

- [ ] **Step 4: Run focused and full checks**

Run: `npm test -- src/lib/roles.test.ts`, `npm test`, `npm run lint`, and `npm run build`.

- [ ] **Step 5: Review the diff**

Confirm that only the route decision, its test, and the design/plan files changed; ensure no shared-route guard, database, or authentication behavior changed.
