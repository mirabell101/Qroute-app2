# Recent Searches Account Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep guest searches local until verified account synchronization succeeds, then maintain an isolated, owner-only account history with safe retries.

**Architecture:** Add an owner-scoped `recent_searches` table and invoker-rights RPC that atomically merges and bounds history. Express exposes that operation behind the existing verified-token middleware; a React provider coordinates the anonymous list, per-account pending writes, and the Recent Searches page.

**Tech Stack:** React, TypeScript, Express, Supabase/PostgreSQL RLS and RPC, Vitest.

**Spec:** [2026-11-03-recent-search-account-transfer-manual-location-design.md](../specs/2026-11-03-recent-search-account-transfer-manual-location-design.md)

## Global Constraints

- Keep at most 25 entries per user and expire entries older than 30 days.
- Deduplicate by `(user_id, item_type, item_id)` and retain the greatest `last_searched_at`.
- The table columns are `id uuid`, `user_id uuid`, `item_type text`, `item_id bigint`, `last_searched_at timestamptz`, and `created_at timestamptz`.
- Derive the database owner from `auth.uid()`; never trust a frontend-supplied user ID.
- Use `requireAuth` and request-scoped Supabase access; never use the service-role key.
- RLS must remain owner-only for all authenticated users, including administrators.
- Clear the anonymous key only after a successful merge response; keep failed account writes in that account's own pending queue.
- Do not change existing migrations or apply unrelated schema/policy changes.

## Review Focus

- Invalid, expired, future-dated, duplicate, or over-limit incoming rows → Task 1 validates them before the RPC; test `parseRecentSearchEntries` for all constraints.
- A caller supplies another `user_id` → Task 2 ignores/rejects ownership input and tests that the RPC receives no user ID.
- A failed or response-lost transfer → Task 3 retains guest data until confirmed and uses an idempotent retry; test failure then successful retry.
- A stale request completes after logout or account switch → Task 3 scopes state by authenticated ID and tests account A data is never displayed for B or anonymous.
- Map metadata no longer contains a stored target → Task 3 uses a readable unavailable fallback without another history-specific lookup.

---

### Task 1: Add Owner-Scoped Storage and Atomic Merge

**Files:**
- Create: `supabase/migrations/20261103100000_recent_searches.sql`
- Create: `server/recentSearches.ts`
- Test: `server/recentSearches.test.ts`

**Interfaces:**
- Consumes: `RecentSearchRow = { id: string; item_type: "route" | "stop" | "terminal"; item_id: number; last_searched_at: string; created_at: string }`.
- Produces: `parseRecentSearchEntries(value: unknown, now: number): RecentSearchInput[]` and `mergeRecentSearches(client, entries): Promise<RecentSearchRow[]>`; the RPC accepts entries only, never a `user_id`.

- [ ] **Step 1: Write failing tests** for accepted item types and IDs, malformed payloads, timestamp expiry/future rejection, deduplication by type and ID retaining the newest timestamp, and the 25-entry limit.
- [ ] **Step 2: Run the tests and verify the missing validator/merge behavior fails for the expected reason.**

Run: `npm test -- server/recentSearches.test.ts`

- [ ] **Step 3: Implement typed validation and the RPC adapter** in `server/recentSearches.ts`. Keep the expected owner out of the function arguments and preserve database errors for the route to report.
- [ ] **Step 4: Add the migration** with the six requested columns, defaults for UUID/timestamps, FK cascade to `auth.users`, a unique constraint on `(user_id, item_type, item_id)`, and an item-type check. Enable RLS with owner-only SELECT/INSERT/UPDATE/DELETE policies and authenticated-only grants.
- [ ] **Step 5: Implement `merge_recent_searches(p_entries jsonb)` as an invoker-rights transaction.** Derive owner from `auth.uid()`, merge only valid fresh entries, preserve existing `id`/`created_at` on conflict, keep the newest timestamp, prune expired rows, delete rows after rank 25, and return the caller's remaining rows ordered newest first.
- [ ] **Step 6: Run the focused tests** and inspect the migration for function privileges and owner-only policy predicates.

Run: `npm test -- server/recentSearches.test.ts`

Expected: all tests pass; the function has no owner-ID parameter and is not `SECURITY DEFINER`.

### Task 2: Expose Authenticated History Operations

**Files:**
- Create: `server/routes/recentSearchesRoutes.ts`
- Create: `server/routes/recentSearchesRoutes.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: Task 1's `mergeRecentSearches` and `RecentSearchRow`.
- Produces: `GET /api/recent-searches` and `POST /api/recent-searches/merge` returning `{ success: true, items: RecentSearchRow[] }`; `DELETE /api/recent-searches/:itemType/:itemId` removes one own item and `DELETE /api/recent-searches` clears only the authenticated caller's rows.

- [ ] **Step 1: Write failing route tests** for unauthenticated denial, owner-scoped GET/DELETE via the bearer-token client, batch merge without trusting a body `user_id`, and surfacing failed RPC/database requests without success-shaped fallbacks.
- [ ] **Step 2: Run the route tests and verify they fail because the router is not mounted/implemented.**

Run: `npm test -- server/routes/recentSearchesRoutes.test.ts`

- [ ] **Step 3: Implement the router** with `requireAuth`; build its Supabase client only from `res.locals.accessToken`. Use merge with an empty list for the bounded GET/expiry cleanup path.
- [ ] **Step 4: Mount `/api/recent-searches`** in `server/index.ts`.
- [ ] **Step 5: Run both server test files** and confirm no request accepts an owner ID.

Run: `npm test -- server/recentSearches.test.ts server/routes/recentSearchesRoutes.test.ts`

Expected: all route/service tests pass.

### Task 3: Transfer Guest History and Isolate Account State

**Files:**
- Create: `src/lib/recentSearchesApi.ts`
- Create: `src/lib/recentSearchesApi.test.ts`
- Create: `src/lib/recentSearchesSync.ts`
- Create: `src/lib/recentSearchesSync.test.ts`
- Create: `src/components/recent-searches/recentSearchesStore.ts`
- Create: `src/components/recent-searches/RecentSearchesContext.tsx`
- Modify: `src/lib/recentSearches.ts`
- Modify: `src/lib/recentSearches.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/transit-map/useTransitMap.ts`
- Modify: `src/pages/registered-user/recent-searches/recent-searches.tsx`
- Modify: `src/pages/registered-user/recent-searches/recent-searches.test.ts`

**Interfaces:**
- Consumes: Task 2's `/api/recent-searches` endpoints; `getRouteMapIndex()` and `getTerminals()` for cached display names.
- Produces: an authenticated API client that never accepts `user_id`; a user-keyed provider exposing `items`, `loading`, `error`, `record`, `remove`, `clear`, and `retrySync`.

- [ ] **Step 1: Write failing tests** for authenticated request headers and row mapping; transfer merging with account rows; duplicate-newest behavior; expiry and 25-item capping; guest-key clearing only after success; preservation after failure; single-flight same-user calls; per-user pending queues; and logout/account-switch isolation.
- [ ] **Step 2: Run the focused tests and verify each failure reflects missing behavior.**

Run: `npm test -- src/lib/recentSearches.test.ts src/lib/recentSearchesApi.test.ts src/lib/recentSearchesSync.test.ts`

- [ ] **Step 3: Implement authenticated API methods** using the current Supabase session's access token and the same-origin Express API. Map database `item_type`/`item_id`/`last_searched_at` fields to the existing UI shape without storing account rows in the anonymous key.
- [ ] **Step 4: Implement synchronization and local pending storage.** Keep guest data under `qroute_recent_searches`; store only unsynchronized authenticated entries under a key scoped by the verified account ID. Merge retries through the same endpoint, clear each local queue only after a successful response, and serialize/suppress duplicate requests per account.
- [ ] **Step 5: Add the account-keyed provider.** On a verified identity transition or restored verified session, load/merge guest and same-account pending entries. On failure, retain both queues and expose explicit retry state. Reset in-memory data on logout/account switch.
- [ ] **Step 6: Wire the provider into `App`, route map search selections through its `record` action, and preserve per-account remove/Clear All behavior.**
- [ ] **Step 7: Resolve account row names from the existing route/point/terminal map caches; use a clear unavailable label when an item no longer resolves.**
- [ ] **Step 8: Keep the retention caption accurate**: retain the browser-data warning for anonymous users and show account-synced wording for signed-in users.
- [ ] **Step 9: Run focused frontend tests** and confirm the existing anonymous page and map restoration tests remain green.

Run: `npm test -- src/lib/recentSearches.test.ts src/lib/recentSearchesApi.test.ts src/lib/recentSearchesSync.test.ts src/pages/registered-user/recent-searches/recent-searches.test.ts src/lib/routeMap.test.ts`

Expected: all selected tests pass; anonymous data is never cleared on an unsuccessful sync.

### Task 4: Apply the Approved Migration and Verify

**Files:**
- No additional source files.

- [ ] **Step 1: Run `npm test`, `npm run lint`, and `npm run build`.** Record full-suite baseline failures separately; fix failures caused by this change.
- [ ] **Step 2: Review the complete diff** for RLS/auth regressions, accidental account data in shared localStorage, duplicate requests, and unrelated changes.
- [ ] **Step 3: Apply only `20261103100000_recent_searches.sql`** to the connected Supabase project using the migration tool; do not insert test history into real user accounts.
- [ ] **Step 4: Verify the deployed columns, unique constraint, RLS enablement/policies, function security mode, and grants using read-only catalog queries.**

Expected: the remote project contains only the approved new history table/function/policies; no existing policy or migration is changed.
