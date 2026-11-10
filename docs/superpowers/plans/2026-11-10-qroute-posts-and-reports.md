# QRoute Posts and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real community-post moderation and user reports for community posts and transit routes, and show live report totals in Admin.

**Architecture:** Extend the existing Community API for authenticated report intake; add protected Admin report and post-moderation endpoints under the existing `requireAuth` then `requireAdmin` router guard. Persist visibility and report status in additive RLS-protected schema, filter hidden posts in both direct authenticated reads and the public RPC, and wire the existing Community, map, Post Management, Reports, and Dashboard surfaces without redesigning them.

**Tech Stack:** React 19, TypeScript, Express 5, Supabase JS, PostgreSQL migrations, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-qroute-admin-operational-design.md`

## Global Constraints

- Every `/api/admin/*` endpoint is protected by `requireAuth` followed by `requireAdmin`.
- Derive authority from `user_roles`; never trust browser-supplied roles or actor IDs.
- Never expose the Supabase secret/service-role credential to browser code.
- Enable RLS and do not weaken existing policies or public access boundaries.
- Add only reversible, timestamped migrations; do not apply them remotely.
- Existing posts remain published by default; routine delete is soft delete.
- Preserve the current visual language and page layouts; add only necessary in-place controls.
- Do not change Google OAuth or password authentication.
- Errors must remain visible; never return placeholder success or fabricate counts.

## Review Focus

- A hidden/deleted post requested directly by URL must not leak via the community API or public RPC; test in Task 2.
- An unauthenticated or non-registered account must not create reports, and reporter identity must come from auth; test in Task 2.
- A reporter must never read another user's report or set resolution fields; test migration policy intent and API behavior in Task 1 and Task 2.
- Invalid target type, malformed UUID/route ID, missing target, or oversize report text must be rejected; test in Task 2.
- Repeated status changes and failed writes must not show false success or corrupt report/post state; test in Task 3.

---

### Task 1: Persist post visibility and reports

**Files:**
- Create: `supabase/migrations/<timestamp>_community_moderation_and_reports.sql`
- Create: replacement public Community RPC definition inside the new migration; do not edit the applied migration.
- Test: `server/communitySchema.test.ts` (create; Vitest is the configured runner)

**Interfaces:**
- Produces `community_posts.moderation_status` with values `published`, `hidden`, `deleted`; existing rows default to `published`.
- Produces `user_reports` with UUID `id`, `reporter_id`, `target_type` (`community_post` or `route`), type-validated text `target_id`, bounded `reason` and optional details, status (`pending`, `resolved`, `dismissed`), `created_at`, `updated_at`, `resolved_at`, and `resolved_by`.
- Reports reference posts/routes by type plus text ID so the report migration does not guess the absent checked-in route ID DDL. API validation verifies the referenced target exists. No physical deletion is introduced.

- [ ] **Step 1: Add schema assertions for visibility defaults and report constraints**

Add focused migration-contract tests for the existing-post `published` default, allowed target/status values, exactly one logical target, bounded text, RLS enablement, and reporter/moderator policy boundaries. Runtime authorization behavior is covered by endpoint tests in Task 2.

- [ ] **Step 2: Run the migration assertions and confirm they fail before implementation**

Run: `npx vitest run --config vitest.community.config.ts server/communitySchema.test.ts`
Expected: assertions fail because the migration contract is not present. Do not use production or remote credentials.

- [ ] **Step 3: Add one additive timestamped migration**

Add the constrained visibility column, `user_reports`, lookup indexes, RLS policies and least-privilege grants. Preserve existing rows. Replace the direct post/comment/vote read policies so unpublished content and its child data are not readable through direct table access. Add a replacement `get_public_community_data` function with the same signature/return contract that excludes non-published posts from post and comment data. Limit report reads to the reporter and server-side moderator role; Admin APIs continue to enforce `requireAdmin`.

- [ ] **Step 4: Run migration assertions and review rollback**

Run the same targeted test. Expected: PASS; migration contracts are present. Review SQL policy logic directly. Document rollback as leaving additive data/schema intact; never drop report data automatically.

### Task 2: Add authenticated report intake and visibility-safe Community reads

**Files:**
- Modify: `server/routes/communityRoutes.ts`
- Modify: `server/communityValidation.ts`
- Test: `server/routes/communityRoutes.test.ts` (create)
- Modify: `src/lib/community.ts`
- Test: `src/lib/community.test.ts` (create)

**Interfaces:**
- Produces `POST /api/community/reports` accepting `{ targetType: "community_post" | "route", targetId: string, reason: string, details?: string }`; derives `reporter_id` from `res.locals.user.id`.
- Produces `submitCommunityReport(input: CommunityReportInput): Promise<void>` in `src/lib/community.ts`.
- Existing `GET /posts`, `GET /posts/:postId`, and `GET /comments` expose published posts only; Admin access uses a separate Admin API.

- [ ] **Step 1: Test report input validation and target existence**

Add tests for valid post and route reports, malformed UUID/route identifiers, unknown target, empty/oversize reason/details, and a client-supplied reporter ID being ignored/rejected.

- [ ] **Step 2: Test community visibility filtering**

Add route tests proving published posts are returned and hidden/deleted posts are absent both in lists and direct detail/comment queries.

- [ ] **Step 3: Run focused route tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts server/routes/communityRoutes.test.ts`
Expected: new tests fail against the missing endpoint/visibility filter.

- [ ] **Step 4: Implement report validation and the protected intake endpoint**

Require authentication and `requireRegisteredUser`; validate target shape, target existence using the request-scoped client, and bounded text. Insert with `reporter_id` from the verified request actor; do not accept state, resolver, timestamps, or reporter identity from the client. Keep database detail out of API errors.

- [ ] **Step 5: Filter community post, detail, and comments queries**

Add the `moderation_status = published` predicate to all direct Community read queries that return posts or comments. The public RPC filtering is supplied by Task 1.

- [ ] **Step 6: Implement the frontend report client and test API contract**

Add `CommunityReportInput` and `submitCommunityReport` using the existing authenticated request helper. Test token/session handling, exact JSON body, and surfaced API errors.

- [ ] **Step 7: Run focused server and client tests**

Run: `npx vitest run --config vitest.community.config.ts server/routes/communityRoutes.test.ts src/lib/community.test.ts`
Expected: PASS.

### Task 3: Admin report processing, post moderation, and live report summary

**Files:**
- Modify: `server/admin.ts`
- Modify: `server/routes/adminRoutes.ts`
- Modify: `server/admin.test.ts`
- Modify: `server/routes/adminRoutes.test.ts`
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminApi.test.ts`
- Modify: `src/pages/admin/post-management/post-management.tsx`
- Modify: `src/pages/admin/reports/reports.tsx`
- Modify: `src/pages/admin/dashboard/dashboard.tsx`

**Interfaces:**
- Produces `getAdminReports(client, status?): Promise<AdminReportRecord[]>` and `getAdminPosts(client): Promise<AdminPostRecord[]>` in `server/admin.ts`.
- Produces `GET /api/admin/reports`, `PATCH /api/admin/reports/:reportId` with `{ status }`, `GET /api/admin/posts`, and `PATCH /api/admin/posts/:postId` with `{ moderationStatus }`.
- Produces typed client methods `getAdminReports`, `updateAdminReportStatus`, `getAdminPosts`, and `updateAdminPostStatus`; summary adds `reports` and `pendingReports` counts.
- All handlers use the existing router-wide `requireAuth` then `requireAdmin`; resolved actor comes from verified `res.locals.user`.

- [ ] **Step 1: Add service and route tests**

Test authorized reads/mutations, invalid UUID/status, missing rows, safe database errors, Admin actor audit fields, exact report counts, and post states `published`/`hidden`/`deleted`. Include unauthenticated and registered-user 401/403 cases for each new Admin endpoint.

- [ ] **Step 2: Add frontend parser/client tests**

Test valid report/post records, rejection of malformed service responses, status update payloads, and visible API failures.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts server/admin.test.ts server/routes/adminRoutes.test.ts src/lib/adminApi.test.ts`
Expected: new tests fail because services, endpoints, and parsers are missing.

- [ ] **Step 4: Implement Admin services and protected endpoints**

Query all post visibility states for Admin only. List reports with reporter/target details and stable ordering. Persist only allowed report/post status transitions and server-derived resolver/timestamp. Add report counts to summary without returning success if any count query fails.

- [ ] **Step 5: Implement typed Admin API methods**

Extend the existing `requestAdmin` helper for JSON mutation requests, preserving session/account identity checks and existing error parsing. Parse every response before returning it.

- [ ] **Step 6: Wire Post Management actions**

Load posts via `getAdminPosts`, retain search/filter behavior, and wire in-place hide, restore, and soft-delete controls. Update local rows only after a successful response; show the existing error/retry feedback on failure.

- [ ] **Step 7: Wire Reports table and resolution controls**

Replace the placeholder section with the existing Reports page's in-place table/filter layout. Load live reports and wire pending/resolved/dismissed updates; keep state and errors consistent with server results.

- [ ] **Step 8: Wire dashboard report counts**

Feed exact total and pending report counts from `AdminSummary` into the existing Reports card and note, preserving its layout and styling.

- [ ] **Step 9: Run focused tests**

Run: `npx vitest run --config vitest.community.config.ts server/admin.test.ts server/routes/adminRoutes.test.ts src/lib/adminApi.test.ts`
Expected: PASS.

### Task 4: Add in-place report actions to user-facing post and route surfaces

**Files:**
- Modify: `src/pages/registered-user/community/community.tsx`
- Modify: `src/components/transit-map/TransitMapPanel.tsx`
- Test: `src/lib/community.test.ts` (extend report client tests)

**Interfaces:**
- Consumes `submitCommunityReport` from Task 2.
- Post action submits `targetType: "community_post"` and the selected post ID.
- Route action submits `targetType: "route"` and the selected route ID serialized as a string.

- [ ] **Step 1: Add client tests for pending and error outcomes**

Test exact target payloads and surfaced failures in the report client. The configured Vitest runner includes `.test.ts` files and has no DOM testing library, so component interactions are verified manually in Step 3 rather than through an unsupported UI test setup.

- [ ] **Step 2: Run focused client tests and verify failure**

Run: `npx vitest run --config vitest.community.config.ts src/lib/community.test.ts`
Expected: tests fail until the report API contract is implemented in Task 2.

- [ ] **Step 3: Wire report controls using current component styles**

Add only the necessary control and existing-pattern dialog/form at the post and selected-route detail surfaces. Use the existing auth/login prompt for logged-out users. Do not change the page/map layout or redesign surrounding controls.

- [ ] **Step 4: Manually verify the post and route report interactions**

Verify logged-out prompts, target IDs, pending duplicate prevention, success feedback, and visible failure feedback in the existing Community and map screens. Confirm no layout or styling changes outside the added control.

### Task 5: Verify the posts/reports slice

**Files:**
- Modify: `src/pages/admin/adminNavigation.test.ts`

- [ ] **Step 1: Run all relevant tests**

Run: `npx vitest run --config vitest.community.config.ts server/communitySchema.test.ts server/admin.test.ts server/routes/adminRoutes.test.ts server/routes/communityRoutes.test.ts src/lib/adminApi.test.ts src/lib/community.test.ts src/pages/admin/adminNavigation.test.ts`
Expected: all selected tests pass.

- [ ] **Step 2: Run type check, full suite, and production build**

Run: `npx tsc --noEmit`
Expected: 0 TypeScript errors.

Run: `npm test`
Expected: the full configured suite passes.

Run: `npm run build`
Expected: production build succeeds; record any existing chunk-size warning.

- [ ] **Step 3: Review diff and migration safety**

Extend the navigation test to assert Dashboard, Route Management, Post Management, Reports, and User Management map to their existing paths; assert Settings remains unmapped because no settings capability exists. Verify only in-scope files changed, Admin authorization remains first, RLS is enabled, public reads exclude hidden content, no client can set report ownership/resolution, and migration rollback does not destroy report data.
