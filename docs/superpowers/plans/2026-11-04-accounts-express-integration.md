# Accounts Express Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing Accounts UI while connecting supported account data and edits to authenticated Express operations and replacing fabricated Points and Badges with unavailable states.

**Architecture:** Add a request-scoped, `requireAuth`-protected `/api/account` router that derives the account ID from verified middleware context and queries Supabase with the caller's token. Use an additive migration for owner-scoped username updates and private profile-photo storage. Keep the existing page and form structure while replacing local account/reward state with server state.

**Tech Stack:** React, TypeScript, Express 5, Supabase Auth/Postgres/Storage, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-accounts-express-integration-design.md`

## Global Constraints

- Keep the Accounts page layout, styling, navigation, buttons, forms, and interactions.
- Use verified Express authentication context; never use a frontend-supplied user ID to select or modify an account.
- Keep owner-only RLS enabled and use the request-scoped Supabase client.
- Do not add a points/badges backend, database schema, fabricated values, dependencies, or unrelated refactors.
- Never return or log passwords, access tokens, or service credentials.
- Legacy `qroute_accounts` local data is not authoritative; only a bounded image data URL from the record whose ID matches the verified account may be migrated.
- Profile photos use a dedicated private bucket, fixed `${verifiedUserId}/profile` path, 5 MB maximum, and JPEG/PNG/WebP only.
- Update only the approved additive database objects; do not modify an applied migration or weaken existing policies.

## Review Focus

- **A legacy local account belongs to another user or contains a fake ID:** never render its account data or migrate its photo; test a mismatched ID.
- **Username is malformed, reserved by another account, or unchanged:** validate server-side, map unique violations to a safe conflict, and test invalid/duplicate names.
- **A password update is attempted with a wrong current password or mismatched auth identity:** reject without changing credentials; test both branches.
- **A photo request has an unsupported MIME type, oversized body, or path/account mismatch:** reject and avoid storage writes; test each boundary.
- **No profile row or profile photo exists, or a request has expired authentication:** return correct empty/unauthorized behavior without fabricated account data; test these paths.

---

### Task 1: Add Owner-Scoped Profile Photo Storage and Username Grant

**Files:**
- Create: `supabase/migrations/20261103164721_accounts_profile_storage.sql`

**Interfaces:**
- Consumes: Existing `public.profiles` owner-only SELECT/UPDATE policies and existing Storage policies.
- Produces: `authenticated` may update only `profiles.username`; private `profile-photos` bucket with a 5 MB limit and JPEG/PNG/WebP allowlist; object SELECT/INSERT/UPDATE/DELETE restricted to the authenticated user's first path segment.

- [ ] **Step 1: Add the additive migration**

  Grant `UPDATE(username)` on `public.profiles` to `authenticated`. Create the private `profile-photos` bucket with file size limit `5242880` and allowed MIME types `image/jpeg`, `image/png`, and `image/webp`. Add named Storage policies for SELECT, INSERT, UPDATE, and DELETE where `bucket_id = 'profile-photos'` and `storage.foldername(name)[1] = auth.uid()::text`; UPDATE uses the same condition in `USING` and `WITH CHECK`.

- [ ] **Step 2: Review migration definitions locally**

  Verify the migration contains no table changes, broad grants, public bucket access, or policy weakening. Confirm the existing `profiles` owner-only UPDATE policy continues to scope the username grant.

- [ ] **Step 3: Apply only after implementation plan approval and verify remotely in Task 4**

  Do not apply remotely during this task before the Express handlers are ready to use the bucket.

### Task 2: Implement Authenticated Express Account Operations

**Files:**
- Create: `server/account.ts`
- Create: `server/routes/accountRoutes.ts`
- Create: `server/routes/accountRoutes.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `requireAuth`, `getSupabaseClientForAccessToken`, verified `res.locals.user` and `res.locals.accessToken`.
- Produces: `GET /api/account`, `PATCH /api/account`, `PUT /api/account/password`, and `PUT /api/account/photo`.
- Response shape: `{ success: true, account: { email: string, username: string, profilePhotoUrl: string | null } }` for GET/PATCH/photo; `{ success: true, message: string }` for password.

- [ ] **Step 1: Test GET profile ownership and empty photo behavior**

  Add `GET /api/account` route tests that prove the selected profile row uses only `res.locals.user.id`, email comes from verified user auth data, and an absent photo returns `profilePhotoUrl: null`. Add an unauthenticated request test expecting 401.

- [ ] **Step 2: Run the account route tests and verify the expected failures**

  Run `npm test -- server/routes/accountRoutes.test.ts`. Expect failures because the account route/API is not implemented.

- [ ] **Step 3: Implement account service and GET route**

  Implement `getAccount(client, verifiedUser)` and route behavior in `server/account.ts` and `server/routes/accountRoutes.ts`. Query `profiles` for only `username` filtered by verified `id`. Resolve the deterministic `profile-photos/${verifiedUser.id}/profile` object using the request-scoped client and return a 1-hour signed URL if present; return null when absent. Handle missing profile as 404, never expose other profile fields, and return a safe generic 500 on database/storage failures.

- [ ] **Step 4: Test username validation, persistence, duplicate conflict, and ownership**

  Add `PATCH /api/account` tests for valid persisted username, invalid username rejected with 400, duplicate username mapped to a safe 409, missing row 404, and proof the update filter uses verified user ID rather than request input.

- [ ] **Step 5: Implement PATCH username**

  Accept only `{ username }`, require `/^[a-zA-Z0-9_]{3,30}$/`, and update only `profiles.username` with `.eq("id", verifiedUser.id)`. Map PostgreSQL unique violation `23505` to 409 and do not accept `id` or extra mutable profile fields.

- [ ] **Step 6: Test password verification and identity binding**

  Add tests for missing/invalid password values, wrong current password, authenticated identity mismatch, and successful update without returning credentials.

- [ ] **Step 7: Implement PUT password**

  Validate the current and new password values using the existing strength rule. Use a newly created regular Supabase client to sign in with verified `user.email` and `currentPassword`; reject unless the returned user ID equals `res.locals.user.id`. Update the password using that verified password session. Never log the body or return tokens/passwords.

- [ ] **Step 8: Test and implement private photo upload**

  Add route tests for JPEG/PNG/WebP accepted, other MIME types rejected, payloads over 5 MB rejected, and upload path derived from verified identity. Implement `PUT /api/account/photo` with an Express raw-body parser limited to `5mb`; accept only the migration's MIME allowlist and upload bytes with `upsert: true` to `${verifiedUser.id}/profile`. Return the refreshed account response and a signed URL.

- [ ] **Step 9: Mount the router and run focused backend tests**

  Mount at `/api/account` in `server/index.ts`. Run `npm test -- server/routes/accountRoutes.test.ts`.

### Task 3: Connect Profile UI and Remove Fabricated Rewards

**Files:**
- Create: `src/lib/accountApi.ts`
- Create: `src/lib/accountApi.test.ts`
- Modify: `src/pages/registered-user/Profile/Profile.tsx`
- Modify: `src/pages/registered-user/points-badges/points-badges.tsx`

**Interfaces:**
- Consumes: `/api/account` routes from Task 2 and the current Supabase session.
- Produces: `getAccount(expectedUserId)`, `updateAccountUsername(expectedUserId, username)`, `updateAccountPassword(expectedUserId, currentPassword, newPassword)`, and `uploadAccountPhoto(expectedUserId, file)` API functions.

- [ ] **Step 1: Test client account session binding and response/error validation**

  Add API tests proving requests include the bearer token only when the current Supabase session matches `expectedUserId`, successful account responses are validated, and backend error messages are surfaced without exposing tokens.

- [ ] **Step 2: Run client API tests and verify the expected failures**

  Run `npm test -- src/lib/accountApi.test.ts`. Expect failures because the account API client is not implemented.

- [ ] **Step 3: Implement the account API client**

  Follow `src/lib/recentSearchesApi.ts` for API base URL, session identity guard, bearer authorization, response validation, and error handling. Send photo bytes as the request body with the file's actual MIME type; do not encode large images as JSON/base64.

- [ ] **Step 4: Test the existing Profile page with real account data and unavailable rewards**

  Add server-rendered component tests using ReactDOMServer for loading/loaded account content, no email/username/password sourced from legacy local account state, and unavailable Points/Badges text with no fabricated numeric rewards or badge names.

- [ ] **Step 5: Replace local account and password storage with backend calls**

  In `Profile.tsx`, remove `qroute_accounts` as a source of account/email/password state and remove all reward/contribution local calculations. Load the API account for `currentUserId`; retain existing loading/error presentation style and visual layout. Make username and password saves asynchronous API operations and update displayed state only after success. Keep current validation and success/error message presentation.

- [ ] **Step 6: Connect photo selection and migrate safe legacy photo**

  Keep the existing file input and control styling. Enforce the bucket's MIME/size limits and call `uploadAccountPhoto`. Once the server account has loaded, inspect only the legacy record with `id === currentUserId`; if it contains a bounded valid image data URL and the server has no photo, upload it once, then remove `qroute_accounts` regardless of upload result. Ignore all legacy username/email/password fields, and surface migration failure using the page's existing message area. Prevent repeated attempts for a user during the mounted page lifetime.

- [ ] **Step 7: Replace Points and Badges mock content in both existing sections**

  Keep both page/section layouts and headings. Remove the local contribution/reward calculations, hardcoded totals, contribution-award rules, badge milestones/names/counts, and localStorage event listener. Render a concise not-yet-available state in their existing content areas; do not add an endpoint or fake data.

- [ ] **Step 8: Run focused frontend tests and lint**

  Run `npm test -- src/lib/accountApi.test.ts <Profile test path>` and targeted ESLint on all changed TypeScript files.

### Task 4: Integrate, Apply Approved Migration, and Verify

**Files:**
- Modify only task files as needed for test/build corrections.

**Interfaces:**
- Consumes: Complete account routes, UI integration, and migration from Tasks 1–3.
- Produces: Verified end-to-end account integration and remote schema/storage policy matching the approved migration.

- [ ] **Step 1: Run all relevant account, auth, and regression tests**

  Run the account API and route tests plus existing authentication-related and profile-adjacent tests. Confirm malformed inputs, unauthenticated requests, and cross-account attempts do not expose or modify another account.

- [ ] **Step 2: Apply the approved migration to the connected Supabase project**

  Apply only `20261103164721_accounts_profile_storage.sql`; do not modify existing migrations or apply unrelated schema changes.

- [ ] **Step 3: Verify the deployed database and storage configuration read-only**

  Confirm authenticated `UPDATE(username)` grant, unchanged owner-only `profiles` policies, private bucket limits/MIME allowlist, and exactly owner-folder SELECT/INSERT/UPDATE/DELETE policies. Do not query or display private account records.

- [ ] **Step 4: Run full verification**

  Run `npm test`, `npm run lint`, and `npm run build`. Report all baseline/environment failures explicitly; do not alter unrelated tests or lint issues.

- [ ] **Step 5: Review final diff and cleanup**

  Confirm no UI styling/layout changes, no frontend direct Supabase database/storage calls for account operations, no secret or password logging, no fake points/badges data, and no unrelated files modified. Remove only task-created temporary artifacts.
