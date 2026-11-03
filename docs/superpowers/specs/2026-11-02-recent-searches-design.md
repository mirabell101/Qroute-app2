# Recent Searches Design

## Intent

Let visitors and signed-in QRoute users revisit routes, stops, and terminals they selected in map search, without server-side search tracking.

## Goals

- Record only a selected result, not typed queries; move repeated items to the top, retain up to 100, and expire entries after 30 days.
- Persist history in browser `localStorage`, scoped separately to anonymous visitors and each signed-in user.
- Provide a responsive Recent Searches page with type, readable date/time, individual removal, confirmed Clear All, and an empty state.
- Reopen entries through the existing map-selection handler so route highlighting and place details stay consistent.

## Non-goals and constraints

- No database table, migration, new dependency, global state library, or transfer of anonymous history to an account.
- Do not change search matching, map rendering, Saved behavior, auth permissions, or Community/Contributions flows.
- Store only the search item type, stable ID, display name, and selection timestamp.

## Current architecture

- `TransitMapSearch` sends mouse and keyboard result selection to `useTransitMap`'s `handleSearchResultSelect`.
- That handler selects routes or places; `handleSavedItemSelect` resolves the same route/stop/terminal IDs against loaded map data and invokes that handler.
- Public Landing and protected Home each own a map hook. Their Recents sidebar items do not navigate yet. Saved demonstrates the dedicated list-page and map-return patterns.

## Approaches

1. **Account-scoped `localStorage` (selected):** Use a small typed storage helper and write only from the existing result-selection handler. A public `/recents` page loads the anonymous or signed-in key, and selection navigates to the matching map page with the existing kind/ID selection state. This meets persistence and privacy needs without backend work.
2. **Supabase history table:** Could synchronize history across devices, but requires schema/RLS work and server-side tracking that the requirements do not need.

## Decisions and implementation boundaries

- Use the current authenticated user ID for the local storage scope; use an anonymous scope when signed out. Never merge scopes.
- Prune malformed, expired, and excess entries whenever history is loaded or updated. Deduplicate by type and ID, refreshing the timestamp and ordering on repeat selection.
- Connect Recents from the public Landing and signed-in Home. Keep map selection logic in the existing transit-map hook; the Recent Searches page passes only the stable item kind and ID back to it.
- Test storage validation, expiry, deduplication, size limits, mutations, and map selection resolution. Run relevant project tests and the production build.
