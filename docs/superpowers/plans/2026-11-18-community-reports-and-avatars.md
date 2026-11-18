# QRoute Community Reports and Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure post/comment/author reporting, author avatars, and Admin moderation using a new local-only `community_reports` table.

**Architecture:** Keep report submission in the existing Community Express API, with `requireRegisteredUser` and a request-scoped Supabase client. Enforce reporter and target integrity with table RLS, checks, foreign keys, and unique indexes; extend the existing Admin Reports UI using verified Admin requests. Reuse the private profile-photo bucket with one narrow additive read policy for registered users viewing visible Community authors.

**Tech Stack:** React, TypeScript, Express, Supabase JS/Postgres RLS, Vitest, existing Supabase migrations and pgTAP conventions.

**Spec:** [2026-11-18-community-reports-and-avatars-design.md](../specs/2026-11-18-community-reports-and-avatars-design.md)

## Global Constraints

- “Do not push, apply, deploy, or execute any locally saved migration.”
- “Do not run `supabase db push`.”
- “Do not run `supabase migration up`.”
- “Do not apply all pending migrations.”
- “Do not modify, delete, rename, or rewrite existing migration files.”
- “Only eligible authenticated registered users should submit reports.”
- “Do not trust frontend-supplied reporter IDs, author IDs, or report status.”
- “Do not use service-role credentials or bypass RLS to make the feature work.”
- “Do not weaken, disable, drop, replace, or bypass any existing RLS policies.”
- Keep the profile-photo bucket private; expose no private profile fields.
- Keep Visitor Community output and behavior unchanged.
- Do not read `.env`, `.env.local`, secrets, API keys, access tokens, or credential files.
- Add no dependencies and make no remote database changes.

## Review Focus

- **Reporter/author spoofing and target mismatch:** the server derives IDs and the database policy/FKs validate them; pin with route tests for forged identity and mismatched comment/post/user targets.
- **Self-report and hidden/missing content:** reject before insert; pin with post/comment route tests.
- **Concurrent duplicate submissions:** unique indexes remain authoritative; pin with a duplicate-key-to-409 route test and SQL test.
- **Reason tampering and blank `Other` details:** validate against the exact reason list in UI and server; pin with model and parser tests.
- **Missing/failed photos and live comments:** use a stable fallback and hydrate live comment author IDs from the authenticated endpoint; pin with avatar and realtime-state tests.

---

### Task 1: Registered-user reporting UI and client contract

**Files:**
- Create: `src/lib/communityReport.ts`
- Create: `src/lib/communityReport.test.ts`
- Modify: `src/lib/community.ts`
- Modify: `src/lib/community.test.ts`
- Modify: `src/pages/registered-user/community/community.tsx`

**Interfaces:**
- `COMMUNITY_REPORT_REASONS`: the exact eight options in the approved spec, ending in `Other`.
- `CommunityReportTarget`: discriminated union for a post, comment, post author, or comment author; comment targets carry only the comment ID.
- `reportCommunityTarget(target, reason, description?)`: sends a target-specific request and returns `{ reportId: number }`; it never sends reporter or author IDs.
- `validateCommunityReportDraft(reason, description)`: returns a validation message or `null`; `Other` requires trimmed non-empty details.

- [ ] **Step 1: Write failing model/client tests** for the allowed reason list, blank `Other`, optional non-`Other` details, exact post/comment/author endpoint and payload shapes, verified bearer token, and malformed API response.
- [ ] **Step 2: Run the focused tests** with `npm test -- src/lib/communityReport.test.ts src/lib/community.test.ts`; confirm the new cases fail.
- [ ] **Step 3: Implement the report target model and typed Community client** in `src/lib/communityReport.ts` and `src/lib/community.ts`.
- [ ] **Step 4: Add post/comment and their author report actions plus the shared dialog** in `community.tsx`; gate controls to the verified registered-user state and preserve loading, success/error, and repeated-submit protection.
- [ ] **Step 5: Run the focused tests**; confirm model and API contract cases pass.

### Task 2: Community author avatars

**Files:**
- Modify: `src/lib/community.ts`
- Modify: `src/lib/community.test.ts`
- Modify: `server/routes/communityRoutes.ts`
- Modify: `src/pages/registered-user/community/community.tsx`
- Modify: `src/lib/communityRealtimeState.ts` only if a narrow merge adjustment is needed

**Interfaces:**
- `getCommunityProfilePhotoUrls(expectedUserId, authorIds)`: deduplicates author IDs, verifies the active user, and returns signed URLs for accessible `{userId}/profile` objects via the authenticated Supabase Storage client.
- Authenticated post/comment payloads expose `author_id`; anonymous `get_public_community_data` remains unchanged.

- [ ] **Step 1: Add failing client tests** for batched private-bucket signed URLs, deduplication, session mismatch, missing object fallback, and surfaced storage errors.
- [ ] **Step 2: Run the focused client tests**; confirm the new cases fail.
- [ ] **Step 3: Implement the signed-URL loader** in `src/lib/community.ts` using the existing private bucket and authenticated client.
- [ ] **Step 4: Include `author_id` in authenticated multi-post comment reads** in `server/routes/communityRoutes.ts`; keep the Visitor RPC unchanged.
- [ ] **Step 5: Render the photo beside each post/comment name** in `community.tsx`, reuse the current Community avatar fallback on absent or failed images, and load only when the viewer is a registered user.
- [ ] **Step 6: For a live comment on an open thread, refresh that thread from `getCommunityComments`** so the existing broadcast's missing author ID is replaced with canonical comment data.
- [ ] **Step 7: Run focused client, route, and realtime-state tests**; confirm signed URLs, fallback, and author identity behave as specified.

### Task 3: Local report schema and photo RLS migrations

**Files:**
- Create via CLI, then edit: `supabase/migrations/<generated>_community_reports.sql`
- Create via CLI, then edit: `supabase/migrations/<generated>_community_author_photos.sql`
- Create: `supabase/tests/community_reports.test.sql`

**Interfaces:**
- `public.community_reports` is the sole report table for the current database.
- Report target kinds are `post`, `comment`, and `user`; status values are `Pending`, `Reviewed`, and `Dismissed`.
- The second migration adds only the approved registered-user read policy for the fixed profile-photo object of a visible Community author.

- [ ] **Step 1: Generate new migration stubs only** with `.\node_modules\.bin\supabase.cmd migration new community_reports` and `.\node_modules\.bin\supabase.cmd migration new community_author_photos`. Do not run any migration application command.
- [ ] **Step 2: Add failing pgTAP assertions** for RLS enabled, registered-user self-only insert, spoofed reporter/status rejection, invalid target/context rejection, own-content/self-user rejection, duplicate target rejection, Admin read/status updates, and photo access limited to registered users viewing visible authors.
- [ ] **Step 3: Write the report-table migration** with auth-user and Community target foreign keys, target-shape/reason/status/`Other` checks, snapshots, deletion-safe references, indexes, restricted grants, and new-table-only registered-user/reporter/Admin policies. Do not drop or replace any existing policy.
- [ ] **Step 4: Write the separate avatar migration** with the approved additive storage policy; keep the bucket private and preserve every existing storage policy.
- [ ] **Step 5: Review both migration diffs and SQL test assertions** for exact target relationships and policy scope. Do not run `supabase test db`, `db reset`, `db push`, `migration up`, or any command that executes saved migrations.

### Task 4: Secure Community API and Admin moderation

**Files:**
- Modify: `server/communityValidation.ts`
- Modify: `server/routes/communityRoutes.ts`
- Modify: `server/routes/communityRoutes.test.ts`
- Modify: `server/admin.ts`
- Modify: `server/admin.test.ts`
- Modify: `server/routes/adminRoutes.ts`
- Modify: `server/routes/adminRoutes.test.ts`
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminApi.test.ts`
- Modify: `src/pages/admin/reports/reports.tsx`

**Interfaces:**
- `parseCommunityReportInput(value)`: accepts only the approved `targetType`, reason, and optional description; rejects any unsupported reason or blank `Other`.
- `POST /posts/:postId/reports`: accepts `targetType: "post" | "user"` and report text.
- `POST /comments/:commentId/reports`: accepts `targetType: "comment" | "user"` and report text; derives the parent post and author from the comment row.
- `GET /api/admin/reports` and `PATCH /api/admin/reports/:id`: use the verified Admin token, the `community_reports` table, and its Admin RLS policy; no legacy reports table or service-role client.
- Admin report records include target kind, reporter ID, target snapshots, category, explanation, date, and status.

- [ ] **Step 1: Add failing validation and Community route tests** for registered-user enforcement, forged fields, correct target IDs, wrong-parent/missing/hidden targets, self-report, unsupported reason, empty `Other`, optional details, and duplicate `23505` mapped to `409`.
- [ ] **Step 2: Run the focused Community tests**; confirm the new cases fail.
- [ ] **Step 3: Implement parser and report route handlers** using `requireAuth`, `requireRegisteredUser`, existing target RLS visibility, and `res.locals.communitySupabase`; do not call `getSupabaseAdminClient` for Community report writes.
- [ ] **Step 4: Add failing Admin API/service tests** for Admin-only listing and status updates through the authenticated client; verify a registered user cannot access either action.
- [ ] **Step 5: Implement Admin report listing/status operations** against `community_reports` with the verified Admin token and RLS; adapt `AdminReportRecord` and the existing Reports page while preserving its existing moderation controls.
- [ ] **Step 6: Update the Admin dashboard report count/recent activity** to read `community_reports` using the verified Admin-scoped client while leaving other dashboard data access unchanged.
- [ ] **Step 7: Run focused Community/Admin tests** and confirm no Community report write/list/status path uses the service-role client.

### Task 5: Regression proof, implementation record, and final review

**Files:**
- Create: `docs/superpowers/docs/community-reports-and-profile-pictures.md`
- Review: all files listed in Tasks 1–4

- [ ] **Step 1: Run focused tests** for Community reporting, validation, avatars, Admin reports, and existing Community interactions.
- [ ] **Step 2: Run repository gates** with `npm test`, `npm run lint`, and `npm run build`.
- [ ] **Step 3: Review the full Git diff** for target-ID correctness, private data exposure, added-only policy behavior, service-role usage, Visitor regressions, and untouched existing migrations.
- [ ] **Step 4: Confirm no migration was applied or pushed**; record generated local migration filenames and that database-backed SQL tests remain unexecuted under the migration restriction.
- [ ] **Step 5: Write the implementation record** with changed files, schema/flow/security notes, actual test results, local-only migration status, approvals still needed, and limitations.
