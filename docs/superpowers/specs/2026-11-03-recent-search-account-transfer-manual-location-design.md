# Recent Search Account Transfer and Manual Map Location

## Intent

Move authenticated recent searches to the signed-in user's account while
retaining anonymous browser history until a server-confirmed merge succeeds.
Stop requesting location on map load and let users request it explicitly from
the map.

## Goals

- Transfer guest history after a verified sign-in, combining it with the
  authenticated user's existing history.
- Deduplicate by `(kind, targetId)`, retain the newest `searchedAt`, remove
  entries older than 30 days, and keep at most 25.
- Keep account ownership derived from the verified Supabase token, with
  owner-only RLS including for administrators.
- Preserve guest history on any failed transfer; make retry idempotent and
  suppress concurrent duplicate transfers.
- Keep each authenticated account's displayed history isolated through logout
  and account switching.
- Keep the Recent Searches retention caption accurate: anonymous history is
  browser-only; authenticated history is saved to the signed-in account.
- Replace automatic geolocation with an explicit, one-shot map control while
  preserving route/place selection camera behavior and the default viewport.

## Non-goals and constraints

- Apply only the new recent-history migration to the connected Supabase project
  after local implementation and verification; the user explicitly approved
  creating this table and its ownership RLS.
- Do not use a service-role key, accept a client-supplied owner ID, weaken RLS,
  or add an admin exception.
- Do not redesign the map, alter its default center or zoom, add dependencies,
  or refetch transit data for a location request.
- Do not add synchronization throttling, Realtime subscriptions, or other
  Stage 3 infrastructure.
- Preserve the existing uncommitted Recent Searches changes; integrate rather
  than replace them.

## Current implementation and constraints discovered

- [`src/lib/recentSearches.ts`](../../src/lib/recentSearches.ts) stores history
  only in the shared `qroute_recent_searches` localStorage key. There is no
  recent-history API or table in the repository or the inspected Supabase
  project.
- [`src/App.tsx`](../../src/App.tsx) validates restored sessions with Supabase
  and updates the current user from auth-state changes. Login establishes the
  session with `setSession`; signup may first require OTP and then a separate
  login.
- Express [`requireAuth`](../../server/middleware/requireAuth.ts) verifies the
  bearer token and stores the verified user and token in request locals.
  [`server/supabaseClient.ts`](../../server/supabaseClient.ts) provides a
  request-scoped client so RLS runs as that user. Existing saved-item policies
  use `auth.uid()` ownership. The new history table must not grant an
  administrator cross-account access.
- [`useTransitMap`](../../src/components/transit-map/useTransitMap.ts) starts
  `watchPosition` at mount; [`TransitMapCanvas`](../../src/components/transit-map/TransitMapCanvas.tsx)
  flies to each position update. Map center and zoom are currently
  `[14.7167, 121.05]` and `14`. Separate route/place viewport effects implement
  intentional selection behavior and remain unchanged.
- Existing edits in the feature files and prior Stage 1 docs are already
  present in the worktree and are outside this design's authorship.

## Approaches

1. **Atomic database merge through Express (selected):** Add a user-owned
   history table and an invoker-rights database merge function. Express exposes
   authenticated read/merge operations using `requireAuth` and the caller-token
   Supabase client. The function derives ownership from `auth.uid()`, merges
   and prunes in one transaction, and returns the resulting history. This
   avoids partial multi-step writes and makes retries safe.
2. **Express-orchestrated multi-step merge:** Express reads, merges, upserts,
   and prunes through the request-scoped client. This avoids a SQL function,
   but partial failures and concurrent devices can produce inconsistent
   history or require additional recovery logic.
3. **Direct frontend table access:** Rejected because it bypasses the project's
   established Express path for authenticated data operations.

## Proposed design

### Account history and transfer

- Add a new `public.recent_searches` table with the requested columns:
  `id uuid`, `user_id uuid`, `item_type text`, `item_id bigint`,
  `last_searched_at timestamptz`, and `created_at timestamptz`. Generate the
  UUID and timestamps by default, reference `auth.users(id)` with
  `ON DELETE CASCADE`, constrain `item_type` to `route`, `stop`, or `terminal`,
  and uniquely identify items by `(user_id, item_type, item_id)`.
- Enable RLS and allow authenticated users to select, insert, update, and
  delete only rows where `user_id = auth.uid()`. Revoke broad/default grants
  and grant only the needed authenticated operations. Do not add a role-based
  admin bypass.
- Add an invoker-rights merge function that accepts only search entries,
  derives the owner from `auth.uid()`, validates item types, IDs, and
  timestamps, ignores expired/future timestamps, upserts duplicates only when
  the incoming `last_searched_at` is newer, prunes expired records, removes
  entries beyond the latest 25, and returns the user's resulting rows. It
  must not accept a `user_id` argument.
- Add Express endpoints guarded by `requireAuth`: read the authenticated
  user's rows and merge a validated batch via the RPC. The handler never uses
  a frontend-supplied owner ID. A transfer response is successful only when
  the database operation succeeds and the merged result is returned.
- On the first verified authenticated identity transition—including a valid
  session restored after refresh—load guest history, merge it with account
  history, and update the signed-in view from the returned rows. Clear
  `qroute_recent_searches` only after that confirmed response. On any network,
  validation, or database error, leave guest history intact and surface the
  failure. Make the effect single-flight per authenticated user; repeated
  sign-in notifications and retries call the idempotent merge.
- Do not retry in a timer loop. A failed transfer remains available for an
  explicit retry from the Recent Searches page and is attempted again when a
  later verified session activation occurs.
- The signed-in recent-search store and UI are scoped to the current user ID.
  Switching identity resets in-memory account state before loading the new
  account. The anonymous list is never populated with rows fetched from an
  account. Authenticated selections are written to the account history using
  the same merge operation.
- The database table intentionally has no display-name column. Map history
  rows to names from the existing `getRouteMapIndex()` and `getTerminals()`
  data paths, which already cache and coalesce requests; use an unavailable
  item fallback when current map data no longer contains an item.
- Keep the existing browser-data retention caption for anonymous visitors.
  For authenticated users, show equivalent 30-day/25-entry guidance that
  accurately says history is saved to their account.
- **Pending authenticated writes:** To satisfy the requirement not to discard
  unsynchronized entries on logout or account switching, keep only pending
  entries in an account-scoped localStorage queue (key includes the verified
  user ID), not in the shared anonymous key. Retry them by merging when that
  same account is active again. Never read or display one account's pending
  queue for another account. The existing `qroute_recent_searches` remains the
  anonymous history key and is cleared only after guest transfer succeeds.

### Manual map location

- Replace the mount-time `watchPosition` effect with a one-shot
  `getCurrentPosition` call initiated by a location button rendered over the
  map. Use the existing location status/error message path and a ref/state
  guard so repeated clicks cannot overlap requests.
- On a successful fix, update the current-location marker and trigger the
  existing camera path to fly to that location. On denied, unsupported,
  unavailable, or timed-out requests, show a concise error; hide/clear status
  on the existing transient-message lifecycle.
- Do not request location on initial render or map-data refresh. Do not reload
  data. Preserve intentional route and place camera behavior and the existing
  default center/zoom.

## Test approach

- Add storage/API/provider tests for merge semantics, limits and expiry,
  failure-safe clearing, idempotent retries, single-flight requests, and
  account isolation across sign-in, logout, and account switching.
- Add backend tests for verified-user ownership, no accepted owner ID, and
  atomic merge behavior; apply only the approved new migration after local
  verification.
- Add geolocation behavior tests for no mount-time request, manual one-shot
  request and camera update, all error states, overlapping clicks, and
  preserved route/place selection behavior.
- Run focused tests, then `npm test`, `npm run lint`, and `npm run build`.
  Report existing baseline failures separately.

## Migration and rollout

- Add a new timestamped migration only; do not edit applied migrations.
- The migration introduces no existing-data rewrite. Rollback would drop the
  newly added function and table and therefore delete history created after
  deployment; do not run rollback against a populated project without an
  explicit backup and approval.
- Apply the new migration remotely only after local implementation and
  verification. Do not alter unrelated schema, existing policies, or applied
  migrations.

## Calls left for implementation

- Use the currently selected atomic merge architecture and the existing
  Express/Supabase auth conventions.
- Use the exact requested database columns; do not persist display names.
  Resolve names from the existing map data/cache.
- Keep anonymous history in the existing key; use account-ID-scoped local
  storage only for unsynchronized authenticated entries, never for a cached
  account history shown to another user. The user authorized applying the new
  table and owner-only RLS to the connected project after verification.
- Implement history and account isolation first, then the independent manual
  location control.
