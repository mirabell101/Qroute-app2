# Recent Searches Stage 1 Design

## Intent

Let anonymous visitors and authenticated QRoute users revisit their recent route, stop, and terminal selections without recording searches on a server.

## Goals

- Store at most 25 unique searches in the browser under the single key `qroute_recent_searches`.
- Retain entries for 30 days, pruning expired or malformed data whenever history is loaded or updated.
- Record only submitted or selected results, deduplicate by item type and ID, and order by most recent timestamp.
- Keep storage logic separate from the page and reuse the map's existing result-selection and restoration paths.
- Show the requested retention caption, readable timestamps, removal actions, confirmed Clear All, and a useful empty state.
- Preserve ordinary map and search behavior when browser storage is unavailable or a saved item no longer exists.

## Non-goals and constraints

- Stage 1 has no Supabase table, migration, RPC, API endpoint, or Express changes.
- Stages 2 and 3 (account synchronization, throttled/bulk sync, and offline sync) are future work only.
- Do not add a dependency, global state store, Realtime subscription, or infrastructure service.
- Store only `{ kind, targetId, name, searchedAt }`; never store credentials, tokens, geometry, or unnecessary personal data.
- Do not change Saved, Community, Contributions, authentication, admin permissions, or existing map behavior.
- Stage 1 uses one browser-wide local history; account-specific local-cache isolation begins in Stage 2.

## Current architecture

- `TransitMapSearch` sends click and keyboard result selection through `useTransitMap`'s existing result handler.
- `useTransitMap` already records only search-source selections and restores a route, stop, or terminal by resolving stable IDs against the loaded map index and points.
- Landing and Home already link their Recents sidebar item to the public `/recents` page; that page passes only the selected kind and ID back to the appropriate map.
- `src/lib/recentSearches.ts` already isolates browser storage from UI, but currently uses per-user versioned keys and a 100-item limit.

## Approaches

1. **Adjust the existing local adapter (selected):** Retain the current module, page, and map handlers while changing the storage key, limits, and UI copy. This satisfies the Stage 1 constraints with the fewest behavior changes.
2. **Replace it with a new storage system:** Adds duplicate code and migration risk without improving the required local-only behavior.
3. **Implement Supabase synchronization now:** Conflicts with the explicit Stage 1 boundary and requires deferred database/backend work.

## Decisions and implementation boundaries

- Use exactly one storage key, `qroute_recent_searches`, shared by guest and signed-in sessions on the same browser.
- Normalize entries to the allowed fields, discard malformed/future/expired entries, deduplicate by kind and ID, sort newest-first, and cap at 25.
- Keep storage read/write failures contained and reported; search selection and map behavior must continue.
- Keep current-user identity only where needed to choose the map route; it is not part of local history storage.
- If an entry no longer resolves, keep the map responsive and tell the user that it is unavailable.
- Leave database and server directories untouched.

## Future stages (not authorized for this implementation)

### Stage 2: Account synchronization

- Anonymous history remains local until an authenticated sync confirms its transfer; failed transfers retain the local data for safe retry.
- Use the existing Express authentication architecture and verified user identity. Never trust a frontend-supplied user ID for ownership.
- Merge local and account history by item type and ID, keep the newest duplicate timestamp, expire entries older than 30 days, and keep the latest 25.
- Authenticated history is local-first and user-isolated. On sign-in from another device, fetch and merge account history; on logout, isolate account caches and do not silently discard unsynchronized changes.
- Enforce account ownership with RLS, including preventing administrators from accessing other users' history by virtue of their role.
- Do not display another account's local cache. This isolation is deliberately deferred from Stage 1, whose required single local list is shared on the browser.

### Stage 3: Efficient synchronization

- Support throttled writes, bulk fetches, deduplication before sync, bounded expiry cleanup, offline retries, and connectivity-triggered retry.
- Do not add unnecessary Realtime subscriptions, Redis, or other infrastructure.
