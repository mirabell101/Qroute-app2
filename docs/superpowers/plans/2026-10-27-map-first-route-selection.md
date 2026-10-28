# Map-First Route Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home map's route list with searchable map markers, contextual place/route details, full-route highlighting, and click-based segment fare selection.

**Architecture:** Add a typed route-map index that deduplicates shared places while retaining route associations, then reuse it for local search and map markers. Adapt the existing Home page to open place details, select a serving route, draw its existing full OSRM/rail path, and use stop clicks to select the fare segment.

**Tech Stack:** React 19, TypeScript, React Leaflet, Supabase JS, Vitest, ESLint, Vite.

**Spec:** `docs/superpowers/specs/2026-10-27-map-first-route-selection-design.md`

## Global Constraints

- “Do not connect a new geocoding/search provider; search is limited to loaded routes, stops, and terminals.”
- “Do not display every route's road geometry on initial map load.”
- “Do not change fare formulas, discount rules, fare areas, or route moderation policy.”
- “Do not modify Supabase data, migrations, or the user's database reset/seed request as part of this map change.”
- “The first click on an eligible point along the selected route chooses the boarding point; a click on a later point is the destination.”
- “Do not require separate ‘Board here’ / ‘Get off here’ buttons.”
- “The route remains highlighted and its complete path/stops remain on the map when the contextual panel switches to a clicked place.”

## Review Focus

1. **A stop or terminal belongs to multiple routes:** deduplicate its marker but retain every route association. Test: `buildRouteMapIndex deduplicates shared places and retains all route associations` (Task 1).
2. **A nested point is hidden by row-level security:** skip null nested points without failing or creating a fake marker. Test: `buildRouteMapIndex skips hidden nested points` (Task 1).
3. **A terminal has no associated route:** it must remain discoverable and its panel must show that no routes are available. Test: `mergeMapTerminals includes active terminals without route associations` (Task 1).
4. **Search matches routes and places with case differences or whitespace:** return the correct result type and stable matches. Test: `searchRouteMapItems matches route and place names case-insensitively` (Task 1).
5. **Trip stop clicks are out of sequence or repeated after a completed pair:** only a later stop becomes the destination; a new sequence resets safely. Test: `selectTripStop sets a start, then a later destination, and restarts the pair` (Task 1).

---

### Task 1: Add a typed route-map index and tested search/trip helpers

**Files:**
- Create: `src/lib/routeMap.ts`
- Create: `src/lib/routeMap.test.ts`
- Modify: `src/lib/routes.ts`
- Modify: `src/lib/routes.test.ts`

**Interfaces:**
- Produces `RouteMapRoute`: `{ id: number; name: string; transport_type_id: number; transport_types: { name: string; color: string } }`.
- Produces `RouteMapPoint`: `{ kind: PointKind; ref_id: number; name: string; latitude: number; longitude: number; stop_type: StopType; description: string | null; routes: { route: RouteMapRoute; stop_order: number }[] }`.
- Produces `RouteMapIndex`: `{ routes: RouteMapRoute[]; points: RouteMapPoint[] }`.
- Produces `RouteMapRouteRecord`: `RouteMapRoute & { route_stops: { route_id: number; stop_order: number; terminals: RouteMapRawPoint | null; stops: RouteMapRawPoint | null }[] }`, where `RouteMapRawPoint` contains `id`, `name`, `latitude`, `longitude`, optional `stop_type`, and optional nullable `description`.
- Produces `RouteMapSearchResult`: `{ kind: "route"; route: RouteMapRoute } | { kind: "point"; point: RouteMapPoint }`, and `TripSelection`: `{ boardingIndex: number | null; destinationIndex: number | null }`.
- Produces `buildRouteMapIndex(routes: RouteMapRouteRecord[]): RouteMapIndex`, `mergeMapTerminals(index: RouteMapIndex, terminals: Terminal[]): RouteMapPoint[]`, `searchRouteMapItems(routes: RouteMapRoute[], points: RouteMapPoint[], query: string): RouteMapSearchResult[]`, `findRouteStopIndex(stops: RouteStop[], point: Pick<RouteMapPoint, "kind" | "ref_id">): number | null`, and `selectTripStop(selection: TripSelection, clickedIndex: number): TripSelection`.
- Produces `getRouteMapIndex(): Promise<RouteMapIndex>` in `routes.ts`; it fetches eligible active routes and ordered nested route points, then normalizes them with `buildRouteMapIndex`.
- Consumes existing `RouteStop`, `PointKind`, and `StopType` types from `routes.ts`, and `Terminal` from `terminals.ts`.

- [ ] **Step 1: Write failing route-map helper tests**

Add tests named in Review Focus. Also verify:
- `searchRouteMapItems` returns route and point result variants, and an empty query returns no results.
- `findRouteStopIndex` matches both point kind and ID, returning `null` when the point is not on the selected route.
- `selectTripStop` sets the first clicked index as boarding, accepts only an index greater than boarding as destination, and starts a new boarding selection when the pair is complete or the clicked index is not later.
- Shared points are keyed by both `kind` and `ref_id`, so equal numeric IDs from `stops` and `terminals` remain distinct.

- [ ] **Step 2: Run the helper tests and confirm they fail**

Run: `npx vitest run src/lib/routeMap.test.ts`
Expected: FAIL because the helper module and exports do not exist yet.

- [ ] **Step 3: Implement typed index, terminal merge, search, and trip selection helpers**

Implement the interfaces above in `src/lib/routeMap.ts`. Preserve the first available point details for a shared key and append each distinct route association with that route's `stop_order`. Keep search local and case-insensitive; do not make network calls from the pure helpers.

- [ ] **Step 4: Write a failing `getRouteMapIndex()` query test**

Update the Supabase mock in `routes.test.ts` to assert that the query requests nested terminal/stop associations and active/deleted/banned filters. Add a rejection assertion for Supabase query errors. Run `npx vitest run src/lib/routes.test.ts` and confirm these new assertions fail before implementation.

- [ ] **Step 5: Add `getRouteMapIndex()` using the existing Supabase route query pattern**

Select route ID/name/transport type and nested `route_stops` with terminal and stop IDs, names, coordinates, type, description, and stop order. Apply `.eq("is_active", true)`, `.eq("is_deleted", false)`, `.eq("is_banned", false)`, and ascending route-name ordering, matching Home's existing route visibility. Skip hidden/null nested points through `buildRouteMapIndex`; throw Supabase errors explicitly.

- [ ] **Step 6: Run the route-map query and helper tests**

Assert that `getRouteMapIndex` normalizes returned points and applies the active/deleted/banned filters. Run:

```powershell
npx vitest run src/lib/routeMap.test.ts src/lib/routes.test.ts
```

Expected: all selected tests pass.

---

### Task 2: Replace the route list with map-first search and contextual selection

**Files:**
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- Consumes `getRouteMapIndex`, `RouteMapIndex`, `RouteMapPoint`, `RouteMapRoute`, `RouteMapSearchResult`, `mergeMapTerminals`, `searchRouteMapItems`, and `selectTripStop` from Task 1.
- Continues to consume `getRouteDetails`, `getTerminals`, existing fare loaders/calculations, and existing map icons.

- [ ] **Step 1: Load route-map data and merge it with active terminals**

Replace the route-name-only load with `getRouteMapIndex()` while preserving explicit loading/error states. Merge the returned route points with `getTerminals()` so unassociated active terminals remain clickable. Keep route selection and full-detail loading in the existing effect.

- [ ] **Step 2: Add local route/place search and selection handlers**

Make the existing search input filter the loaded route-map routes and points through `searchRouteMapItems`; render results as an accessible list operable by keyboard. Selecting a route result sets the selected route with no pending origin. Selecting a place result opens the place panel and focuses the map on that point. Add `pendingBoardingPoint: Pick<RouteMapPoint, "kind" | "ref_id"> | null`; set it when choosing a route from a place panel, then after `getRouteDetails` resolves use `findRouteStopIndex` to set the initial boarding index and clear the pending point. Clear the pending point when a route is selected from search.

- [ ] **Step 3: Render deduplicated map markers and wire endpoint clicks**

Render all merged active terminal and visible route-stop points once per `kind`/`ref_id`; each point must retain its serving routes. Replace route-point `Popup` actions with map click handlers that open the contextual place panel. When the clicked point belongs to the active route, use `selectTripStop` so the first click chooses boarding and a later click chooses destination. When a point belongs to a different route, show its place panel without changing the active trip until the user chooses one of its routes. Preserve route sequence constraints, an accessible ordered stop list, and existing clear-trip behavior.

- [ ] **Step 4: Replace the route-list card with a combined contextual panel**

Remove the old Routes heading/list and render the clicked place details and serving-route choices with the active route details, fare table, and ordered stop list in the same compact panel. Keep an active route and its trip/fare state when opening another place; when a different route is selected, reset the trip pair. Keep the route line highlighted and all stops visible. Adjust `RouteViewport` padding for the new panel and existing navigation/header layout.

- [ ] **Step 5: Keep fare information available before and after endpoint selection**

When a route is selected without a boarding/destination pair, keep the fare section visible and explain that the user should click a start point and then a later stop. Once both are selected, reuse the existing road/rail fare option, discount, source, verification, and unavailable-state rendering without changing calculations.

- [ ] **Step 6: Run focused and full verification**

Run:

```powershell
npx vitest run src/lib/routeMap.test.ts src/lib/routes.test.ts src/lib/fareCalculations.test.ts src/lib/fares.test.ts
npx eslint src/lib/routeMap.ts src/lib/routeMap.test.ts src/lib/routes.ts src/lib/routes.test.ts src/pages/registered-user/Home/Home.tsx
npm run build
git diff --check
```

Expected: all tests pass, focused ESLint reports no errors, the production build succeeds, and `git diff --check` reports no whitespace errors. Manually verify route search, direct marker click, a point served by multiple routes, selecting origin then later destination, fare updates, and retaining the active route/fare panel when opening another place.
