# QRoute Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace misleading Admin Page fixtures with verified database reads and enforce admin authorization at every new server endpoint while preserving the existing UI and auth flows.

**Architecture:** Add one Express admin router protected by the existing token-verification middleware and a server-side `user_roles` check. Use the existing authenticated Supabase client for route/community reads and the existing server-only Auth Admin client for user listing. Add a typed frontend API client, then wire the existing pages to those responses. Do not write to domain records where the checked-in schema or behavior does not support the existing control.

**Tech Stack:** React 19, TypeScript, Express 5, Supabase JS, Vitest.

**Spec:** [2026-11-09-admin-page-functionality-design.md](../specs/2026-11-09-admin-page-functionality-design.md)

## Global Constraints

- Keep the existing Admin Page and visual structure; do not create a new dashboard.
- No new tables, columns, RLS policies, grants, or remote database changes.
- No fabricated report records, post visibility state, ban state, or settings.
- No mapping of the current simple route form onto the richer route/fare model.
- No OAuth, password-authentication, or session-flow changes.
- No staging, committing, branch switching, or pushing.
- Do not run builds, tests, or other target-controlled code unless an OS-enforced isolated sandbox is available.
- Unsupported writes remain visibly unavailable until their backing schema and behavior are verified.

## Review Focus

1. A registered user with a valid token must still receive `403` from every admin endpoint; add this authorization test in Task 1.
2. A role lookup failure must fail closed with an error response, not an empty or successful admin response; add this test in Task 1.
3. Dashboard data-query failures must be surfaced, not displayed as zero; add this test in Task 1.
4. An empty database must show an explicit empty state, not demo records; add this assertion in Task 3 and Task 4.
5. Unsupported actions must not change local state or imply persistence; cover unavailable data in Task 4 API tests and null destinations in Task 5 navigation tests, then inspect the UI handlers.

---

### Task 1: Secure and expose supported admin reads

**Files:**
- Create: `server/middleware/requireAdmin.ts`
- Test: `server/middleware/requireAdmin.test.ts`
- Create: `server/admin.ts`
- Test: `server/admin.test.ts`
- Create: `server/routes/adminRoutes.ts`
- Test: `server/routes/adminRoutes.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `requireAuth` populates `res.locals.user` and `res.locals.accessToken`; `getSupabaseClientForAccessToken` preserves RLS; `getSupabaseAdminClient` is server-only.
- Produces:
  - `requireAdmin: RequestHandler`, which permits only a verified user with an `admin` row in `user_roles`.
  - `GET /api/admin/summary` → `{ success: true, summary: { registeredUsers: number, routes: number, communityPosts: number } }`.
  - `GET /api/admin/routes` → `{ success: true, routes: AdminRouteRecord[] }`, including the existing ordered route-stop and transport relations needed for display.
  - `GET /api/admin/users` → `{ success: true, users: AdminUserRecord[] }`, using the existing Auth Admin client only after both auth and role checks. `AdminUserRecord` contains `id`, `email`, nullable `username`, and `createdAt`; it contains no fabricated status.
  - `getAdminSummary(adminClient): Promise<AdminSummary>`, `getAdminRoutes(userClient): Promise<AdminRouteRecord[]>`, and `getAdminUsers(adminClient): Promise<AdminUserRecord[]>` in `server/admin.ts`.
  - `AdminSummary` has numeric `registeredUsers`, `routes`, and `communityPosts` fields. `AdminRouteRecord` uses the real route, transport, and ordered stop data shown by `src/lib/routes.ts`, plus only moderation fields already referenced by checked-in migrations.

- [ ] **Step 1: Add failing `requireAdmin` tests**

  Assert that an `admin` database role calls `next`, a `registered_user` or unknown role returns `403`, a role lookup error returns `500`, and missing verified request context does not grant access.

- [ ] **Step 2: Run the focused middleware test in an OS-enforced isolated sandbox**

  Run: `npm test -- server/middleware/requireAdmin.test.ts`
  
  Expected: the new tests fail because `requireAdmin` does not yet exist. If an OS-enforced sandbox is unavailable, do not execute the test; record the blocker and continue with static review only.

- [ ] **Step 3: Implement `requireAdmin`**

  Query `user_roles` using the verified user ID and request-scoped client. Do not inspect email, provider, user metadata, or request-body role values. Log database failures and fail closed.

- [ ] **Step 4: Add failing admin data-service tests**

  Assert summary counts use the confirmed tables, routes retain actual stop order, user records include only registered-user roles and selected profile fields, and database/Auth Admin failures reject instead of returning empty success.

- [ ] **Step 5: Add failing admin-router authorization tests**

  Assert requests without a valid token receive `401`, registered users receive `403`, admins can read supported data, and database/service errors return non-success responses.

- [ ] **Step 6: Run new data-service and router tests in an OS-enforced isolated sandbox**

  Run: `npm test -- server/admin.test.ts server/routes/adminRoutes.test.ts`

- [ ] **Step 7: Implement the admin data services and router**

  In `server/admin.ts`, use request-scoped RLS for transit reads and the existing server-only Auth Admin client to list accounts. After the route guard succeeds, read only the required count, role, and profile fields server-side to produce the summary and associate account IDs with registered-user roles and usernames. Select only fields needed by the current UI. Do not add write endpoints. Apply `requireAuth` before `requireAdmin` to every route, translate service errors into explicit non-success responses, and mount `/api/admin` in `server/index.ts`.

- [ ] **Step 8: Run focused middleware, data-service, and router tests in an OS-enforced isolated sandbox**

  Run: `npm test -- server/middleware/requireAdmin.test.ts server/admin.test.ts server/routes/adminRoutes.test.ts`

  Expected: role-boundary and data-mapping tests pass. If the sandbox is unavailable, record the blocker instead of running target code.

### Task 2: Add a typed frontend admin API client

**Files:**
- Create: `src/lib/adminApi.ts`
- Test: `src/lib/adminApi.test.ts`

**Interfaces:**
- Consumes: Task 1 response shapes, `API_BASE_URL`, and `supabase.auth.getSession`.
- Produces: `getAdminSummary(expectedUserId)`, `getAdminRoutes(expectedUserId)`, and `getAdminUsers(expectedUserId)`, each returning validated typed data or throwing a surfaced error.

- [ ] **Step 1: Add failing API-client tests**

  Cover missing sessions, changed active user, HTTP errors, malformed success payloads, and valid empty collections. Verify the client sends the current access token and never fabricates a successful fallback.

- [ ] **Step 2: Run the focused API-client test in an OS-enforced isolated sandbox**

  Run: `npm test -- src/lib/adminApi.test.ts`
  
  Expected: tests fail because the client functions do not exist. If an OS-enforced sandbox is unavailable, do not execute the test.

- [ ] **Step 3: Implement the typed API client**

  Follow `src/lib/accountApi.ts` conventions for session ownership, JSON parsing, error extraction, and response validation. Add no dependencies.

- [ ] **Step 4: Run the focused API-client test in an OS-enforced isolated sandbox**

  Run: `npm test -- src/lib/adminApi.test.ts`
  
  Expected: all session, error, parsing, and empty-data cases pass. If unavailable, record the blocker.

### Task 3: Connect the existing dashboard to real summary data

**Files:**
- Modify: `src/pages/admin/dashboard/dashboard.tsx`

**Interfaces:**
- Consumes: `getAdminSummary(expectedUserId)`.
- Produces: real registered-user, route, and post totals; explicit loading/error states; unavailable states for reports and recent attendance.

- [ ] **Step 1: Add failing summary-state tests**

  In `src/lib/adminApi.test.ts`, assert valid nonzero and zero summaries parse, malformed/error responses reject, and no success-shaped fallback is produced. The repository has no React component-test dependency; do not add one for this task.

- [ ] **Step 2: Implement dashboard data loading and states**

  Remove static summary values and the generated “Admin Attendance” activity. Keep the existing cards/layout; render an explicit unavailable state for the report metric because no report source exists.

- [ ] **Step 3: Verify dashboard data behavior in the isolated test environment**

  Run: `npm test -- src/lib/adminApi.test.ts`

  Expected: exact counts and error/empty payloads are distinguished by the API layer. Verify the page rendering manually only if a safe configured browser environment is available; otherwise report it as unverified.

### Task 4: Connect supported read-only admin lists

**Files:**
- Modify: `src/pages/admin/route-management/route-management.tsx`
- Modify: `src/pages/admin/user-management/user-management.tsx`
- Modify: `src/pages/admin/post-management/post-management.tsx`
- Tests: focused response-mapping tests in `src/lib/adminApi.test.ts`

**Interfaces:**
- Consumes: `getAdminRoutes`, `getAdminUsers`, and the existing authenticated `/api/community/posts` response.
- Produces: route records with actual stops/transport data; registered accounts from Supabase Auth; actual community posts; explicit loading/error/empty states.

- [ ] **Step 1: Add failing data-mapping tests**

  In `src/lib/adminApi.test.ts`, assert route stops retain stored order, nullable usernames remain null, community posts have no invented visibility/report status, and empty responses produce empty lists.

- [ ] **Step 2: Replace route fixtures and local-only route CRUD**

  Render actual route/stop/transport details. Remove or disable Add/Edit controls and the incompatible origin/destination/fare form; explain that persisted route editing is unavailable under the verified schema-only scope.

- [ ] **Step 3: Replace user fixtures and local-only status controls**

  Render actual registered-user records and preserve search by email/username. Remove sample active/banned counts, status filters, and Ban/Unban mutations because no supported status or ban policy is established; explain the unavailable actions.

- [ ] **Step 4: Replace post fixtures and local-only visibility/report values**

  Reuse the existing community-post endpoint. Keep detail viewing and search; derive transport filters from actual post records. Remove fake visibility/report status and make hide/unhide unavailable.

- [ ] **Step 5: Verify the list-page data contract in the isolated test environment**

  Run: `npm test -- src/lib/adminApi.test.ts`

  Expected: only real server data is parsed and empty results remain empty. Verify rendered pages and disabled actions manually only if a safe configured browser environment is available; otherwise report them as unverified.

### Task 5: Make unsupported modules and admin-landing navigation truthful

**Files:**
- Modify: `src/pages/admin/reports/reports.tsx`
- Modify: `src/pages/admin/base/base.tsx`
- Modify: admin navigation in `src/pages/admin/dashboard/dashboard.tsx`, `src/pages/admin/route-management/route-management.tsx`, `src/pages/admin/user-management/user-management.tsx`, and `src/pages/admin/post-management/post-management.tsx`
- Create: `src/pages/admin/adminNavigation.ts`
- Test: `src/pages/admin/adminNavigation.test.ts`

**Interfaces:**
- Consumes: existing app destinations in `src/App.tsx`; no settings, reports, notification, or map-filter API is introduced.
- Produces: a report-unavailable state, working links to existing user-facing destinations, and visibly unavailable Settings/Notifications/map-filter controls.

- [ ] **Step 1: Add failing navigation-mapping tests**

  Assert Recents, Saved, Contribution, Community, and Profile map to `/recents`, `/saved`, `/contribution`, `/community`, and `/profile`; unsupported Settings, Notifications, and map filters have no destination.

- [ ] **Step 2: Replace report fixtures with an explicit unavailable state**

  Remove fabricated reports and local status updates. Preserve the existing Reports page and route, clearly explaining that no report data source is configured in the checked-in schema.

- [ ] **Step 3: Wire existing admin-landing destinations**

  Connect Recents, Saved, Contribution, Community, and Profile to their existing routes. Do not invent notification or vehicle-filter behavior; make those controls visibly unavailable.

- [ ] **Step 4: Correct unsupported Settings navigation**

  Keep the existing visual navigation item but disable it with an accessible explanation; do not add a settings page or persistence model.

- [ ] **Step 5: Verify the focused navigation/state tests in the isolated test environment**

  Run: `npm test -- src/pages/admin/adminNavigation.test.ts`

  Expected: existing destination mappings pass and unsupported controls have no destination. Verify click behavior manually only if a safe configured browser environment is available; otherwise report it as unverified.

### Task 6: Review and prepare the Git report

**Files:**
- Review only: all implementation files above and the complete worktree status.
- Do not modify: pre-existing Google-auth files unless a regression directly caused by this work is found; if so, stop and request approval before changing them.

- [ ] **Step 1: Review the full diff and classify every staged, unstaged, untracked, and deleted file**

  Verify that no environment secrets, generated files, unrelated modules, or existing user changes were altered.

- [ ] **Step 2: Run permitted verification**

  Run `npm test -- server/middleware/requireAdmin.test.ts server/admin.test.ts server/routes/adminRoutes.test.ts src/lib/adminApi.test.ts src/pages/admin/adminNavigation.test.ts src/lib/authCallback.test.ts src/lib/authRedirect.test.ts src/lib/authSession.test.ts src/lib/roles.test.ts server/userRoles.test.ts`, `npm run build`, and `npm run lint` only inside an OS-enforced isolated sandbox. If unavailable, list each blocked command without claiming success. Do not perform live login, browser, or database checks without a configured safe test environment.

- [ ] **Step 3: Provide the Git Push Preparation Report**

  Include branch, exact files to include/exclude and why, change summary, test results, existing commits ahead of `origin/chesca`, and risks. Do not stage, commit, or push.
