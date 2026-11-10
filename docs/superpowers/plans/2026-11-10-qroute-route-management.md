# QRoute Route Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, database-backed route creation, editing, and soft deletion to the existing Admin route page.

**Architecture:** Keep reads and writes behind the existing Admin API guard. Verify the deployed transit schema before writing route-specific SQL, then use a transaction-backed server operation to persist a route and its ordered terminal/stop sequence atomically. Use existing transport catalog and route-point records; never create unreviewed transit points as a side effect.

**Tech Stack:** React 19, TypeScript, Express 5, Supabase JS, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-qroute-admin-operational-design.md`

## Global Constraints

- Every `/api/admin/*` endpoint is protected by `requireAuth` followed by `requireAdmin`.
- Derive authority from `user_roles`; never trust browser-supplied roles or actor IDs.
- Never expose Supabase secret/service-role credentials to browser code.
- Verify actual route, route-stop, variant, point, and foreign-key definitions before enabling writes; route base DDL is absent from the repository.
- Create/update route plus ordered stops atomically; failed stop writes must not leave a partial route.
- Delete is soft (`is_deleted` / verified equivalent); never hard-delete route data.
- Preserve current layout and styling; add only in-place form and action controls.
- Do not apply migrations remotely or edit applied migrations.

## Review Focus

- Missing or incompatible deployed columns/constraints must block writes before mutation, not be guessed; test schema preflight in Task 1.
- Empty, one-stop, duplicate, or invalid stop sequences must be rejected; test Task 2.
- Stop entries must refer to exactly one existing terminal or stop; test Task 2.
- A variant from another transport type or a deleted/inactive point must be rejected; test Task 2.
- Failed transaction and soft deletion must preserve existing route/fare/bookmark/report relationships; test Task 2 and Task 3.

---

### Task 1: Verify deployed transit schema and route write contract

**Files:**
- Read-only inventory: `supabase/seeds/reset_and_seed_qc_mrt3.sql`, existing route queries in `server/admin.ts` and `src/lib/routes.ts`
- Create only after schema confirmation: `supabase/migrations/<timestamp>_admin_route_mutations.sql` if a transaction function is required
- Test: `server/adminRouteSchema.test.ts` (create for schema contract and service validation)

**Interfaces:**
- Produces a written schema contract for route ID type, route columns, route-stop FKs/constraints, variant/type relationship, active/approval/deletion flags, and point approval/active fields.
- Stop before route writes if actual schema cannot be verified from an approved read-only database schema export or local database; ask for the schema export rather than inventing fields.

- [ ] **Step 1: Add a schema-contract test fixture from verified definitions**

Record the verified table/column/FK definitions in a non-secret fixture and assert the Admin service contract maps only to those columns.

- [ ] **Step 2: Verify the preflight blocks incomplete schema**

Run: `npx vitest run --config vitest.community.config.ts server/adminRouteSchema.test.ts`
Expected: PASS for verified local contract; a missing required field/FK causes a clear precondition failure and no mutation.

- [ ] **Step 3: Choose the narrow transaction boundary**

Use a server-only transaction function for create/update of `routes` and `route_stops`. If a SQL function is required, accept only validated route fields and ordered point IDs, enforce mutually exclusive terminal/stop references, and grant execution only to the backend privileged role. Add no schema changes to existing transit tables unless verified and necessary.

### Task 2: Implement route catalog, transaction service, and Admin endpoints

**Files:**
- Modify: `server/admin.ts`
- Modify: `server/routes/adminRoutes.ts`
- Modify: `server/admin.test.ts`
- Modify: `server/routes/adminRoutes.test.ts`
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminApi.test.ts`
- Add verified migration if needed: `supabase/migrations/<timestamp>_admin_route_mutations.sql`

**Interfaces:**
- Produces `getAdminRouteOptions(client): Promise<AdminRouteOptions>` for active transport types/variants and selectable existing terminals/stops.
- Produces `saveAdminRoute(client, input, actorId): Promise<AdminRouteRecord>` with validated create/update input and ordered points.
- Produces `softDeleteAdminRoute(client, routeId, actorId): Promise<void>`.
- Produces `GET /api/admin/route-options`, `POST /api/admin/routes`, `PUT /api/admin/routes/:routeId`, and `DELETE /api/admin/routes/:routeId`.
- Route stop input is `{ kind: "terminal" | "stop", refId: number }[]`; persisted `stop_order` is 1-based and follows request order.

- [ ] **Step 1: Add service and endpoint tests**

Test auth 401/403 for all operations; invalid IDs/body, fewer than two points, duplicate points, empty route name, wrong variant/type, invalid point kind/reference, transaction rollback, ordered reads, and soft delete without child-row deletion.

- [ ] **Step 2: Add client parser/API tests**

Test route option parsing, exact create/edit/delete payloads, invalid service response rejection, session mismatch, and surfaced API failures.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts server/admin.test.ts server/routes/adminRoutes.test.ts server/adminRouteSchema.test.ts src/lib/adminApi.test.ts`
Expected: new tests fail because options and mutation contracts are absent.

- [ ] **Step 4: Implement selectable catalog reads**

Return only existing valid catalog rows and points, with the point kind/reference identity and labels needed by the form. Reject incomplete query results instead of presenting empty success.

- [ ] **Step 5: Implement atomic save and soft-delete services**

Use the verified transaction mechanism. Validate variant/type membership and every point before writing. Preserve route ID during edit; update stop order within the same transaction. Soft delete only the route's verified removal flag.

- [ ] **Step 6: Add guarded Admin handlers and typed frontend client**

Keep the router-wide `requireAuth`, `requireAdmin` ordering. Validate all route params/bodies before service calls. Derive mutation actor from `res.locals.user`, not request data. Extend `requestAdmin` for JSON methods and validate response records.

- [ ] **Step 7: Run focused tests**

Run the same focused command. Expected: PASS.

### Task 3: Wire add/edit/delete form into existing Route Management page

**Files:**
- Modify: `src/pages/admin/route-management/route-management.tsx`
- Modify: `src/lib/adminApi.test.ts`

**Interfaces:**
- Consumes `getAdminRouteOptions`, `saveAdminRoute`, and `softDeleteAdminRoute` from `src/lib/adminApi.ts`.
- Existing search, filters, table, and route detail remain in place.

- [ ] **Step 1: Add API payload and response tests**

Test exact create/edit/delete payloads, ordered stop serialization, invalid server responses, and errors. The configured Vitest runner has no DOM testing library; manually verify form interactions in Step 4.

- [ ] **Step 2: Run focused client tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts src/lib/adminApi.test.ts`
Expected: new tests fail because route mutation methods are missing.

- [ ] **Step 3: Add in-place form and action handlers**

Use existing page styles for the form/modal and errors. The form selects existing variants and points only; permit reordering/removing rows and require at least two. Do not alter the existing table or page structure. Update displayed data only after server success.

- [ ] **Step 4: Manually verify route form behavior**

Verify create/edit prefill, stop ordering, at-least-two-point validation, delete confirmation, refresh only after server success, and visible error states. Confirm the existing route table/search/filter layout remains unchanged.

### Task 4: Verify route management

- [ ] **Step 1: Run route-focused tests**

Run: `npx vitest run --config vitest.community.config.ts server/admin.test.ts server/routes/adminRoutes.test.ts server/adminRouteSchema.test.ts src/lib/adminApi.test.ts`
Expected: all selected tests pass.

- [ ] **Step 2: Run type check and build**

Run: `npx tsc --noEmit` (0 errors), `npm test` (full suite passes), and `npm run build` (success; record any existing chunk-size warning).

- [ ] **Step 3: Review transaction, authorization, and preservation**

Confirm verified schema matches the implementation, every route endpoint is guarded, writes are atomic, soft deletion is reversible, and no existing route/fare/stop history is physically deleted.
