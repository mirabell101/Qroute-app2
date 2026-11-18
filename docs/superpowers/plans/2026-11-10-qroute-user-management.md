# QRoute User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Admin user list fully data-backed and allow safe role and account suspension changes.

**Architecture:** Extend the existing Admin data service and protected `/api/admin/*` router to return recognized `user_roles`, profile, and Supabase Auth status and to perform role and Auth Admin mutations server-side. Preserve the current list/search/detail UI and add only in-place action controls.

**Tech Stack:** React 19, TypeScript, Express 5, Supabase Auth Admin, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-qroute-admin-operational-design.md`

## Global Constraints

- Every `/api/admin/*` endpoint is protected by `requireAuth` followed by `requireAdmin`.
- Derive authority from `user_roles`; never trust browser-supplied roles or actor IDs.
- Never expose the Supabase secret/service-role credential to browser code.
- Do not change Google OAuth, password authentication, or the established sign-in flow.
- Permit only existing roles `registered_user` and `admin`; preserve multiple role rows.
- Prevent self-demotion and demotion/removal of the final Admin.
- Suspend/reactivate through Supabase Auth Admin; do not claim temporary bans instantly invalidate already-issued access tokens.
- Preserve the current visual language and page layout; errors must remain visible.

## Review Focus

- Missing Auth account/profile/role rows must fail explicitly, not show fabricated data; test Task 1.
- Duplicate role rows and an account with both roles must retain correct role semantics; test Task 1 and Task 2.
- Self-demotion, final-admin removal, and concurrent final-admin changes must not lock out administrators; test Task 2.
- Auth suspension failure must not update the UI as though the account was suspended; test Task 2 and Task 3.
- A stale browser session or a different active account must not submit an Admin action; test Task 3.

---

### Task 1: Return complete Admin account records

**Files:**
- Modify: `server/admin.ts`
- Modify: `server/admin.test.ts`
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminApi.test.ts`

**Interfaces:**
- Produces `AdminUserRecord` with `id`, `email`, `username`, `createdAt`, recognized `roles: Array<"registered_user" | "admin">`, and `bannedUntil: string | null`.
- Existing `getAdminUsers(client)` continues listing accounts that have at least one recognized role; no account is silently omitted due to missing expected profile fields.

- [ ] **Step 1: Add service tests**

Test registered-only, admin-only, multi-role accounts, duplicate role rows, null username/email, ban status, pagination over Auth pages, missing Auth users, profile query errors, and unknown role rows.

- [ ] **Step 2: Add client parser tests**

Test valid records and reject invalid role values, malformed ban status, and incomplete response records.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts server/admin.test.ts src/lib/adminApi.test.ts`
Expected: new tests fail because the expanded record fields are not returned or parsed.

- [ ] **Step 4: Implement role/profile/Auth aggregation**

Query `user_roles` once for recognized roles, page through Auth Admin users, batch profile reads, and join by verified user ID. Return normalized unique role arrays and `bannedUntil` from Supabase Auth metadata. Propagate any failed or incomplete query.

- [ ] **Step 5: Extend the frontend response parser**

Validate the new role and status fields without unsafe casts; preserve existing table/search rendering.

- [ ] **Step 6: Run focused tests**

Run the same focused command. Expected: PASS.

### Task 2: Add protected role and suspension operations

**Files:**
- Modify: `server/admin.ts`
- Modify: `server/routes/adminRoutes.ts`
- Modify: `server/admin.test.ts`
- Modify: `server/routes/adminRoutes.test.ts`
- Create: `supabase/migrations/<timestamp>_admin_role_mutation.sql` only if a transaction-scoped final-Admin guard function is needed

**Interfaces:**
- Produces `PATCH /api/admin/users/:userId/roles` accepting `{ role: "registered_user" | "admin", enabled: boolean }`; actor ID is read from `res.locals.user`.
- Produces `PATCH /api/admin/users/:userId/status` accepting `{ suspended: boolean }`.
- Role operation changes only the requested role row; reject self-demotion and removal/demotion of the final Admin.
- Status operation uses server-side `auth.admin.updateUserById`; never invokes user sign-in flows.

- [ ] **Step 1: Add endpoint/service tests**

Test anonymous 401, non-admin 403, malformed user ID/body 400, self-demotion denial, final-admin guard, valid add/remove of both roles, role preservation, suspend/reactivate behavior, Auth Admin error handling, and actor attribution derived from auth.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts server/admin.test.ts server/routes/adminRoutes.test.ts`
Expected: new tests fail because mutation routes/services are missing.

- [ ] **Step 3: Implement server validation and role mutation**

Validate UUID and exact body shape. Use an atomic server-only database operation for final-Admin validation and role change (serialize final-admin changes under a transaction-scoped lock); grant execution only to the backend privileged role. Confirm actor remains an Admin from `user_roles` inside the operation, in addition to the route guard.

- [ ] **Step 4: Implement Supabase Auth suspension operations**

Use the existing server-only Admin client and supported Auth Admin user update API for ban/unban. Return the resulting ban state. Keep Auth errors explicit in server logs and generic to callers.

- [ ] **Step 5: Run focused tests**

Run the same focused command. Expected: PASS.

### Task 3: Wire existing User Management controls

**Files:**
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminApi.test.ts`
- Modify: `src/pages/admin/user-management/user-management.tsx`

**Interfaces:**
- Produces typed `setAdminUserRole(expectedUserId, targetUserId, role, enabled)` and `setAdminUserSuspended(expectedUserId, targetUserId, suspended)` methods.
- Existing search remains; role and suspension filtering is computed from loaded user records.

- [ ] **Step 1: Test mutation client methods**

Test exact payloads, account/session mismatch, parser behavior, and visible API errors with no false success. The configured Vitest runner has no DOM testing library; verify component interactions manually in Step 4.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts src/lib/adminApi.test.ts`
Expected: new tests fail before actions are wired.

- [ ] **Step 3: Implement typed API calls**

Reuse `requestAdmin`, preserve active-account verification, and parse returned updated account fields.

- [ ] **Step 4: Wire in-place role/status filters and actions**

Add controls in the current table/detail surfaces only. Refresh the affected row from server results after success. Prevent duplicate requests, and show errors in the established alert/error area. Display suspension as an Auth ban state and explain that already-issued access tokens may remain valid until expiry.

- [ ] **Step 5: Run focused tests and manually verify UI**

Run: `npx vitest run --config vitest.community.config.ts src/lib/adminApi.test.ts`
Expected: PASS.

Manually verify role/status filters, disabled duplicate actions, server-result refresh, errors, self-demotion prevention, and the session-expiry caveat in the existing page.

### Task 4: Verify user management

- [ ] **Step 1: Run relevant tests**

Run: `npx vitest run --config vitest.community.config.ts server/admin.test.ts server/routes/adminRoutes.test.ts src/lib/adminApi.test.ts`
Expected: all selected tests pass.

- [ ] **Step 2: Run type check and build**

Run: `npx tsc --noEmit` (0 errors), `npm test` (full suite passes), and `npm run build` (success; record existing chunk warning if present).

- [ ] **Step 3: Review security and diff**

Confirm all Admin APIs retain guard order, mutation actor is server-derived, Auth Admin is never called from browser code, no auth workflow changed, and final-Admin checks are atomic.
