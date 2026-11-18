# Admin Notifications and Post Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, admin-only notifications at three unique pending reports per post and database-backed post hide/restore with visibility-checked photo delivery.

**Architecture:** Extend the existing `reports` and `community_posts` tables through a new additive migration. Use the existing Express/Supabase clients and role middleware for report intake and Admin operations; create notification events atomically in Postgres and keep read state per admin. Serve visible photos through a public visibility-checking proxy and hidden photos through the existing protected Admin boundary.

**Tech Stack:** React 19, TypeScript, Express 5, Supabase JS/Postgres, Supabase migrations, Vitest, ESLint, Vite.

**Spec:** [2026-11-17-admin-notifications-post-visibility-design.md](../specs/2026-11-17-admin-notifications-post-visibility-design.md)

## Global Constraints

- The threshold is three unique pending reports from distinct registered users.
- A user may report a Community post only once; one notification event exists per post.
- Anonymous and regular users may view photos of visible posts; hidden-post photos require admin access.
- Only verified database admins may list/mark admin notifications or change post visibility.
- Keep OAuth, session restoration, role assignment, existing Admin report status operations, and visible Community behavior unchanged.
- Never expose a Supabase secret/service-role credential to browser code.
- Use only additive migrations; do not apply migrations to the hosted project.
- Preserve existing staged and untracked work; do not commit, push, switch branches, or discard changes.
- Add no dependencies unless an existing required tool is missing and dependency restoration is necessary.

## Review Focus

1. **Legacy unlinked reports:** they must still be stored/reviewable but must not count toward a post threshold. Pin this in the database report-intake tests.
2. **Threshold boundary and retry:** two pending reporters do not notify; the third creates one event; repeated inserts/status changes do not duplicate it. Pin these cases in the SQL regression tests.
3. **Reporter identity and duplicate input:** a caller cannot choose another reporter ID or report the same post twice. Pin this in Community route/API tests.
4. **Visibility at image-request time:** anonymous/regular requests for hidden posts fail, while visible photos remain available; invalid IDs/indexes fail safely. Pin this in photo-route tests.
5. **Admin boundary and per-admin read state:** unauthenticated/regular users cannot access notification or visibility endpoints, and one admin's receipt does not mark the event read for another. Pin this in Admin route and SQL tests.

---

### Task 1: Add additive moderation and notification schema

**Files:**
- Create: `supabase/tests/community_moderation.test.sql`
- Create: `supabase/migrations/<CLI-generated timestamp>_community_moderation.sql` (generate with `supabase migration new community_moderation`; do not rename an old migration)

**Interfaces:**
- Consumes: Existing `public.reports`, `public.community_posts`, `public.user_roles`, `storage.objects`, and `get_public_community_data(uuid[], boolean, boolean)`.
- Produces: `reports.community_post_id`, `reports.reporter_user_id`, `community_posts.is_hidden`, `admin_notifications`, `admin_notification_reads`, threshold trigger, admin/visibility RLS, and a public RPC that returns photos only for visible posts.

- [ ] **Step 1: Write pgTAP regression cases** in `supabase/tests/community_moderation.test.sql` for: existing unlinked reports remain outside the threshold; direct linked inserts are denied; a linked report's unique reporter/post pair; no event at two pending reports; one event at three; no duplicate event after a repeated trigger opportunity; hidden posts excluded for anon/regular roles but readable by admins; hidden photo paths excluded from the public RPC; private-bucket configuration; and independent read receipts for two admins.
- [ ] **Step 2: Run the database tests before the migration.** Run `supabase test db supabase/tests/community_moderation.test.sql` and confirm the new cases fail against the old schema. Supabase CLI v3 targets local by default; do not add `--remote`. If CLI or Docker remains unavailable, record that blocker; do not connect to or alter the hosted database.
- [ ] **Step 3: Generate a new migration** with `supabase migration new community_moderation`. Use exactly the path emitted by the CLI.
- [ ] **Step 4: Implement only additive SQL** in the generated migration: nullable report links with `ON DELETE SET NULL`; a partial unique linked reporter/post index; `is_hidden NOT NULL DEFAULT false`; one unique notification event per post UUID snapshot; per-admin read receipts; a threshold trigger that counts pending unique linked reports and inserts idempotently; RLS/policies described in the approved design; private bucket configuration and post-visibility-aware Storage SELECT; and a revised public RPC that filters hidden posts and returns visible photo paths. Preserve existing report status/admin review policies, registered-user post INSERT ownership checks, and photo upload/delete ownership policies.
- [ ] **Step 5: Run the SQL regression tests again** with `supabase test db supabase/tests/community_moderation.test.sql` if local Supabase is available. Expected: threshold/idempotency/read-isolation assertions pass. Do not claim database behavior is verified if the local service is unavailable.
- [ ] **Step 6: Review the migration diff** to confirm no prior migration was edited, no existing rows are deleted, and no policy is broadened to ordinary users.

### Task 2: Add authenticated Community post reports

**Files:**
- Modify: `server/communityValidation.ts`
- Modify: `server/routes/communityRoutes.ts`
- Create: `server/routes/communityRoutes.test.ts`

**Interfaces:**
- Consumes: Task 1 report columns and existing `requireAuth`, `requireRegisteredUser`, and request-scoped Supabase client.
- Produces: `POST /api/community/posts/:postId/reports` with `{ reason: string, description: string }`; response `{ success: true, report: { id: number } }`.

- [ ] **Step 1: Write failing route tests** for registered-user success, missing/invalid post, invalid reason/description, anonymous request, non-registered account, and duplicate report. Assert the reporter ID and display text are derived from the verified request/post, not client fields.
- [ ] **Step 2: Run the focused route tests** and confirm each new behavior fails before implementation.
- [ ] **Step 3: Add report input parsing** in `server/communityValidation.ts`; reject empty/oversized text and malformed UUIDs using the existing validation style.
- [ ] **Step 4: Add the report route** after the existing auth and registered-user checks. Verify the target post with the request-scoped client; insert a linked Post/Pending row using the server-only admin client and verified user ID; return 409 for the unique reporter/post conflict and safe, explicit errors otherwise.
- [ ] **Step 5: Run `npm test -- server/routes/communityRoutes.test.ts`** and confirm all report-route cases pass.

### Task 3: Add protected Admin notification and visibility APIs

**Files:**
- Create: `server/adminNotifications.ts`
- Modify: `server/routes/adminRoutes.ts`
- Modify: `server/admin.ts`
- Modify: `server/routes/adminRoutes.test.ts`

**Interfaces:**
- Consumes: Task 1 notification/read tables and `community_posts.is_hidden`; existing `router.use(requireAuth, requireAdmin)`.
- Produces:
  - `GET /api/admin/notifications` → `{ success: true, notifications, unreadCount }`, with `isRead` for the verified admin.
  - `GET /api/admin/notifications/unread-count` → `{ success: true, unreadCount }`.
  - `PATCH /api/admin/notifications/:id/read` → idempotently creates the verified admin's receipt.
  - `PATCH /api/admin/posts/:id/visibility` with `{ isHidden: boolean }` → persists only `is_hidden`.

- [ ] **Step 1: Write failing Admin route tests** for anonymous and regular-user denial; admin notification listing and unread count; per-admin receipt creation/idempotency; invalid notification IDs; visibility hide/restore; and malformed visibility payloads.
- [ ] **Step 2: Run `npm test -- server/routes/adminRoutes.test.ts`** and confirm the new endpoint cases fail before implementation.
- [ ] **Step 3: Implement typed notification queries** in `server/adminNotifications.ts` using the request-scoped verified admin client for reads/receipts. Derive receipt identity only from `res.locals.user`; use the event table as canonical data.
- [ ] **Step 4: Implement visibility mutation** using a validated post UUID, boolean `isHidden`, and the existing server-only Admin client after router authorization. Update only `is_hidden`; return 404 when no post matched.
- [ ] **Step 5: Add the endpoints** under the existing protected Admin router. Mark-read must be idempotent and must not expose another admin's receipt state.
- [ ] **Step 6: Run the focused Admin route tests** and confirm regular users remain 403 and all admin actions pass.

### Task 4: Add visibility-checked photo delivery

**Files:**
- Modify: `server/routes/communityRoutes.ts`
- Modify: `server/routes/adminRoutes.ts`
- Modify: `server/routes/communityRoutes.test.ts`
- Modify: `server/routes/adminRoutes.test.ts`

**Interfaces:**
- Consumes: Task 1 visible-only public RPC/photo paths and private bucket; Task 3 protected Admin router.
- Produces:
  - Public `GET /api/community/posts/:postId/photos/:photoIndex`, returning image bytes only when the current public RPC includes that visible post/photo.
  - Protected `GET /api/admin/posts/:postId/photos/:photoIndex`, returning image bytes for a post/photo after the Admin router verifies the caller.

- [ ] **Step 1: Add failing public proxy tests** for visible post access, hidden post denial, missing photo index, malformed UUID/index, and no-store response headers.
- [ ] **Step 2: Add failing Admin proxy tests** for hidden-post access by admin and denial to unauthenticated/regular callers.
- [ ] **Step 3: Implement shared server-side photo lookup/streaming** that validates the requested index against the post's current `photo_paths`, downloads from the private bucket server-side, returns no-store responses, and never returns object URLs or credentials.
- [ ] **Step 4: Implement public access using the visibility-filtered public RPC**; return not-found when the post or requested photo is not present in the RPC result.
- [ ] **Step 5: Implement hidden-photo Admin access** only inside the protected Admin router; verify the photo belongs to the requested post before reading it.
- [ ] **Step 6: Run focused community and Admin route tests**; assert that hiding a post makes a subsequent public photo request fail.

### Task 5: Connect Community report and photo UI

**Files:**
- Modify: `src/lib/community.ts`
- Modify: `src/lib/communityPublicData.ts`
- Modify: `src/pages/registered-user/community/community.tsx`
- Create: `src/lib/community.test.ts`

**Interfaces:**
- Consumes: Task 2 report endpoint and Task 4 public photo proxy.
- Produces: a typed Community report helper and `CommunityPost.photos[].url` values that point to the public visibility-checking proxy for anonymous and signed-in feed items.

- [ ] **Step 1: Write failing library tests** for report request payload/response, visible public photo URL generation, and preservation of empty photo arrays.
- [ ] **Step 2: Run `npm test -- src/lib/community.test.ts`** and confirm the new cases fail before implementation.
- [ ] **Step 3: Update public post parsing** to preserve the visible RPC's `photo_paths` rather than forcing an empty array, and generate proxy URLs using post ID plus photo index instead of `getPublicUrl`.
- [ ] **Step 4: Add the report action** to the existing Community UI for registered users. Provide reason/details input, loading/error/success feedback, and submit only the post ID and report text; do not accept reporter identity from the browser.
- [ ] **Step 5: Run focused Community library tests and the TypeScript build**; confirm anonymous visible photos use the proxy and no direct public Storage URLs remain in the Community rendering path.

### Task 6: Add the Admin Notifications page, bell count, and report deep link

**Files:**
- Create: `src/components/admin/AdminNotificationBell.tsx`
- Create: `src/pages/admin/notifications/notifications.tsx`
- Create: `src/pages/admin/notifications/notificationsModel.ts`
- Create: `src/pages/admin/notifications/notificationsModel.test.ts`
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminApi.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/admin/adminNavigation.ts`
- Modify: `src/pages/admin/adminNavigation.test.ts`
- Modify: `src/pages/admin/dashboard/dashboard.tsx`
- Modify: `src/pages/admin/base/base.tsx`
- Modify: `src/pages/admin/route-management/route-management.tsx`
- Modify: `src/pages/admin/reports/reports.tsx`

**Interfaces:**
- Consumes: Task 3 Admin notification endpoints and Task 1 event/read schema.
- Produces: typed `getAdminNotifications`, `getAdminUnreadNotificationCount`, and `markAdminNotificationRead` functions; protected `/admin/notifications`; a reusable bell with unread count; View Report navigation to `/admin/reports?reportId=<id>`.

- [ ] **Step 1: Write failing API-client and model tests** for unread count parsing, event/read parsing, mark-read request, malformed payload errors, bell destination, empty state, and opening the matching report ID.
- [ ] **Step 2: Run focused admin API/navigation/model tests** and confirm the new cases fail before implementation.
- [ ] **Step 3: Add typed API functions** in `src/lib/adminApi.ts`, validating response shape and using the existing verified-session request helper.
- [ ] **Step 4: Add the notification bell component** and replace the three inert/count-misused admin bells in Dashboard, Admin Base, and Route Management. The badge must represent unread notifications, not the pending report total; refresh it after a successful read action.
- [ ] **Step 5: Register `/admin/notifications`** behind the existing `adminPage` role guard and map the `"Notifications"` navigation destination without changing other routes or `App.tsx` authentication logic.
- [ ] **Step 6: Build the page** with the established admin visual language, title/message/report/date/read state, empty state, View Report action, and persistent Mark as read feedback.
- [ ] **Step 7: Update Reports deep linking** to read `reportId`, open the corresponding existing report details when present, and show a safe fallback if the referenced report no longer exists.
- [ ] **Step 8: Run focused API/model/navigation tests, targeted ESLint, and `npm run build`.**

### Task 7: Persist Hide/Show controls in Post Management

**Files:**
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminApi.test.ts`
- Modify: `src/lib/community.ts`
- Modify: `src/pages/admin/post-management/post-management.tsx`
- Modify: `src/pages/admin/post-management/postManagementModel.ts`
- Modify: `src/pages/admin/post-management/postManagementModel.test.ts`

**Interfaces:**
- Consumes: Task 3 visibility API and Task 4 protected hidden-photo endpoint.
- Produces: `setAdminPostVisibility(expectedUserId, postId, isHidden): Promise<void>` and database-derived `CommunityPost.is_hidden`.

- [ ] **Step 1: Write failing API/model tests** for hide/show payloads, persisted `is_hidden` interpretation, update errors, and preservation of current post filtering/search.
- [ ] **Step 2: Run focused admin API and post-management model tests** and confirm the new cases fail before implementation.
- [ ] **Step 3: Add typed visibility mutation** to `src/lib/adminApi.ts` and validate the session-bound response.
- [ ] **Step 4: Load database visibility state** into Post Management and remove `hiddenPostIds` local preview state and its warning. Display hidden-post images through the protected Admin photo route; use the public proxy for visible photos.
- [ ] **Step 5: Wire Hide/Show to the API**; update local rendered data only after success, preserve explicit error feedback, and show success feedback. Reloading must use the persisted server value.
- [ ] **Step 6: Run focused post-management/API tests and targeted ESLint.**

### Task 8: Verify the integrated feature

**Files:**
- No new files; review all files changed by Tasks 1–7.

**Interfaces:**
- Consumes: All task outputs.
- Produces: Verified local implementation, a reviewed additive migration, and an honest report of database/browser limitations.

- [ ] **Step 1: Run focused Community, Admin API, navigation, and post-management tests**; record actual results.
- [ ] **Step 2: Run `npm test`**; investigate failures without deleting tests or changing unrelated behavior.
- [ ] **Step 3: Run `npx tsc --noEmit` and targeted ESLint** on every changed TypeScript file.
- [ ] **Step 4: Run `npm run build`** and confirm the production build succeeds.
- [ ] **Step 5: Run `supabase test db supabase/tests/community_moderation.test.sql` only if local Supabase becomes available.** The CLI defaults to local; do not pass `--remote`. Do not apply to a hosted project. Report any database, RLS, Storage, or browser verification that remains blocked.
- [ ] **Step 6: Review `git diff` and `git status`** to confirm only scoped changes were added and all pre-existing staged/untracked work remains untouched. Do not commit or push.
