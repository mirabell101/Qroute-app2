# Direct Map Route Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the place-panel route picker and let passengers select routes and trip stops directly from map markers and route lines.

**Architecture:** Keep route identity and stop membership in the existing route-map model. Add a small tested helper for unambiguous serving-route selection; wire marker clicks to that helper and route-line clicks to active-route selection, while retaining the existing endpoint and fare state transitions.

**Tech Stack:** React, TypeScript, Leaflet / React-Leaflet, Vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-28-map-direct-route-selection-design.md`

## Global Constraints

- “A unique-route point activates its route and boards there. For shared stops, the passenger can distinguish and select the already-visible route paths on the map.”
- “A route-line click activates that exact route by route ID, clears any incompatible boarding/destination and fare, and shows its ordered stops; it does not create a fare estimate.”
- “If a point serves multiple routes and no route is active, do not choose a route implicitly; retain all paths and let the passenger click the intended path.”
- “If a clicked point is outside the active route, it must not change endpoints or fares.”
- “A route-line click does not create a fare estimate.”
- “Use the current route ID and point kind/ID association rather than coordinates to establish membership.”

## Review Focus

1. A stop serves exactly one route: marker selection activates that route and seeds the clicked point as boarding; test the unique-route helper and ensure fare endpoints remain incomplete.
2. A stop serves multiple routes or none: no route is implicitly selected; test that the helper returns no single route.
3. Different routes overlap at identical coordinates: clicking a route line selects that route's ID and clears the old trip; keep route-specific line handlers and route IDs.
4. A route search activates a route without choosing a boarding point: selecting its line must not fabricate a boarding point or fare.
5. A clicked point is outside the active route: it must leave the active trip unchanged and retain the existing incompatibility explanation.

---

### Task 1: Select routes directly from map interactions

**Files:**
- Modify: `src/lib/routeMap.ts`
- Test: `src/lib/routeMap.test.ts`
- Modify: `src/lib/routeGeometry.ts`
- Test: `src/lib/routeGeometry.test.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- Consumes: `RouteMapPoint`, `RouteMapRoute`, `selectTripStop`, existing route-layer state and `pendingBoardingPoint`.
- Produces: `getUniqueServingRoute(point: RouteMapPoint): RouteMapRoute | null`, returning the only serving route when exactly one exists, otherwise `null`.
- Produces: `getNextOverlappingRouteId(routeIds: number[], activeRouteId: number | null, clickedRouteId: number): number`, cycling through exact-overlap route IDs on repeated line clicks.
- Produces: `getRouteGeometryKey(positions: Coordinates[]): string`, treating a path and its reversed coordinate sequence as the same display geometry.

- [x] **Step 1: Write failing helper tests**

Add tests named `getUniqueServingRoute returns the sole serving route`, `getUniqueServingRoute returns null for shared or unserved points`, `getNextOverlappingRouteId cycles through coincident route IDs`, and `getRouteGeometryKey treats reversed path positions as equivalent`. Assert the route ID is preserved for a unique serving route, multiple/zero serving routes return `null`, repeated clicks advance through overlapping route IDs, and reversed paths share a key.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/routeMap.test.ts src/lib/routeGeometry.test.ts`
Expected: FAIL because the new route-selection and geometry-key helpers are not implemented.

- [x] **Step 3: Implement the helper**

Implement the tested route-selection helpers in `src/lib/routeMap.ts` and the direction-independent geometry key in `src/lib/routeGeometry.ts`. Preserve route IDs and do not modify point associations or route geometry.

- [x] **Step 4: Run helper tests**

Run: `npx vitest run src/lib/routeMap.test.ts src/lib/routeGeometry.test.ts`
Expected: all route-map and route-geometry tests pass.

- [x] **Step 5: Wire marker clicks and route-line clicks in Home**

When no route is active, clicking a point with exactly one serving route sets that route ID, stores the point as `pendingBoardingPoint`, and loads that point's route geometry; shared or unserved points only open details and display their available paths. When a route is active, preserve existing valid endpoint selection and incompatibility behavior.

Attach a click handler to each route's colored visible `Polyline`; clicking a different route activates that exact route ID and clears pending boarding and previous endpoints through the existing route-change flow. Clicking the already-active route must not clear its current endpoints. For geometries with the same direction-independent geometry key, repeated clicks cycle through route IDs so an obscured identical path remains selectable. A line click never assigns a boarding point. Leave path display and fare calculations tied to real route geometry and stop identities.

Remove the “Routes serving this place” heading and route-button list from the place-details panel. Preserve the location name, details, image, coordinate display, incompatible-place explanation, route loading errors, and selected-route stop details.

- [x] **Step 6: Verify the task**

Run: `npm test`
Expected: all project tests pass.

Run: `npx eslint src/lib/routeMap.ts src/lib/routeMap.test.ts src/lib/routeGeometry.ts src/lib/routeGeometry.test.ts src/pages/registered-user/Home/Home.tsx`
Expected: no lint errors.

Run: `npm run build`
Expected: TypeScript and Vite production build succeed.
