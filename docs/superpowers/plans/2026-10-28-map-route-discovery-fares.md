# Map Route Discovery and Fare Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every serving route's full path when a place is opened, then estimate fares only for a valid selected-route stop pair.

**Architecture:** Keep route/place identity keyed by route ID and point kind/ID. Load full route details and road geometry lazily for the routes associated with an opened place, caching per route in the Home session; preserve rail's station path. Separate visible route layers from the single fare-active route and render fare output as three category cards rather than a table.

**Tech Stack:** React 19, TypeScript, React Leaflet, Leaflet, Supabase JS, Vitest, ESLint, Vite.

**Spec:** `docs/superpowers/specs/2026-10-28-map-route-discovery-fares-design.md`

## Global Constraints

- “No geocoder or new mapping/routing provider.”
- “No Supabase reset, seed, schema migration, or remote database changes.”
- “No fare formula, fare-area, discount-policy, or route-visibility changes.”
- “No route-wide geometry requests on initial page load; geometry loads only for the routes associated with a place the user opens, or for a route directly selected through search.”
- “Route IDs and `transport_type_id` are the stable identities. Coordinates are for rendering and distance, never route identity.”
- “Hide fare amounts and fare cards until a valid boarding/destination pair exists.”
- “Where both bus and jeepney serve the same physical stop, show distinct, selectable transport-type marker affordances with display-only visual offsets; each opens the same point details and route choices.”
- Preserve the current uncommitted changes on `backend-using-des`; do not commit, push, or access `.env`/remote Supabase.

## Review Focus

1. **Several route IDs share the clicked place or the same road geometry:** all routes remain separate, visible, and selectable; test that route visualization loading and results remain keyed by route ID.
2. **Different route requests finish out of order or fail independently:** stale results do not replace newer route/place selections and one failed route does not hide other paths; test the geometry loader's route-specific errors and verify state guards in Home.
3. **A road route has one stop, or an OSRM result has missing waypoints/legs:** do not invent a fare distance or snap a point to another stop; test `getRouteGeometry` returns no usable distance for incomplete geometry.
4. **A clicked point is shared with or outside the active route:** selection uses both `kind` and ID plus route sequence, never coordinates; test endpoint helper behavior for valid, reverse-order, repeated, and unrelated points.
5. **A fare option or discount rule is missing, or a rail pair is not available:** display unavailable states in the appropriate passenger card without fabricated prices; test fare-card view data for missing estimates and rail fare absence.

---

### Task 1: Add independent route geometry loading

**Files:**
- Create: `src/lib/routeGeometry.ts`
- Create: `src/lib/routeGeometry.test.ts`
- Consume: `src/lib/routes.ts` `RouteDetails`

**Interfaces:**
- Produces `RouteGeometry`: `{ positions: [number, number][]; stopDistances: number[]; stopMapPositions: ([number, number] | null)[]; totalDistanceMeters: number | null; durationSeconds: number | null }`.
- Produces `getRouteGeometry(route: RouteDetails, signal?: AbortSignal): Promise<RouteGeometry>`.
- For road routes, request OSRM using only that route's ordered stops (not current location), return route-following positions, cumulative distance between its stops, and snapped stop positions. Do not use partial/missing OSRM legs as zero-distance fare inputs.
- For matrix/rail routes, return the ordered station line and Haversine cumulative distances, preserving existing rail fare lookup as the source of rail prices.
- A route with fewer than two stops returns no path and no total distance. HTTP, OSRM response, and abort behavior must remain explicit.

- [ ] **Step 1: Write failing tests** named `getRouteGeometry requests only the route's ordered stops`, `getRouteGeometry builds rail station positions without OSRM`, `getRouteGeometry rejects incomplete road distances`, and `getRouteGeometry reports routing failures`.
- [ ] **Step 2: Run the tests and confirm they fail because `routeGeometry.ts` is missing.**

Run: `npx vitest run src/lib/routeGeometry.test.ts`
Expected: FAIL because the module/export does not exist.

- [ ] **Step 3: Implement the typed route geometry loader**

Use the route's ordered stop sequence and adapt the current Home OSRM response handling. Convert OSRM `[longitude, latitude]` values to Leaflet `[latitude, longitude]`; align stop distances and snapped coordinates with `route.route_stops` and omit user location from the request and all route/fare distances.

- [ ] **Step 4: Run the geometry tests**

Run: `npx vitest run src/lib/routeGeometry.test.ts`
Expected: all geometry tests pass.

---

### Task 2: Separate visible route layers from trip selection

**Files:**
- Modify: `src/pages/registered-user/Home/Home.tsx`
- Modify: `src/lib/routeMap.ts`
- Modify: `src/lib/routeMap.test.ts`
- Modify: `src/lib/mapIcons.ts`

**Interfaces:**
- Consumes Task 1 `getRouteGeometry(route, signal)` and `RouteGeometry`.
- Preserve `RouteMapPoint.routes: { route, stop_order }[]` as the serving-route association; all route visualization state is keyed by `route.id`.
- Add a tested helper for applying route stop clicks to `{ boardingIndex, destinationIndex }`: no boarding sets boarding; a later stop sets/updates destination; a point at or before boarding starts a new boarding selection and clears destination.
- Add transport-type-specific marker icon choices for bus and jeepney stop affordances; shared physical points remain one canonical point and expose separate transport options without changing actual route coordinates.

- [ ] **Step 1: Write failing endpoint tests**

Test valid any-stop boarding (including non-terminal stops), later destination, destination replacement by a later stop, same/earlier click starting a new boarding, and point matching by `kind` plus ID rather than coordinates.

- [ ] **Step 2: Run endpoint tests to verify the new cases fail**

Run: `npx vitest run src/lib/routeMap.test.ts`
Expected: FAIL on the new endpoint transition assertions.

- [ ] **Step 3: Implement and verify the endpoint transition helper**

Keep route sequence order authoritative. Do not allow the caller to pass a point that is not found in the selected route's ordered stops.

- [ ] **Step 4: Add route visualization state and lazy loader to Home**

On place click/search, load every associated route's details and geometry in parallel. Cache in-flight/successful work by route ID for the Home session; remove failed promises so a later selection can retry. Keep each route's loading/error/data separate. On route search, load and show that route only. Ignore state updates from stale/unmounted work.

- [ ] **Step 5: Keep geometry, markers, and click behavior route-specific**

Render all paths for the current place's serving route IDs, with configured transport type colors and route-distinguishing line styles. Emphasize the fare-active route. Render stop affordances by transport type, including distinct bus/jeepney indicators at shared points, while keeping map geometry and fare calculations on real route coordinates. Clicking a point opens place details and all serving paths; if it is on the active route, apply the endpoint transition; otherwise do not alter fare endpoints and explain incompatibility in the panel.

- [ ] **Step 6: Verify Task 2**

Run: `npx vitest run src/lib/routeMap.test.ts src/lib/routeGeometry.test.ts`
Expected: all route helper and geometry tests pass.
Run: `npx eslint src/lib/routeMap.ts src/lib/routeMap.test.ts src/lib/routeGeometry.ts src/lib/routeGeometry.test.ts src/lib/mapIcons.ts src/pages/registered-user/Home/Home.tsx`
Expected: no lint errors.

---

### Task 3: Make fare display endpoint-gated and icon-led

**Files:**
- Modify: `src/pages/registered-user/Home/Home.tsx`
- Modify: `src/lib/fareCalculations.ts`
- Modify: `src/lib/fareCalculations.test.ts`

**Interfaces:**
- Consume existing `getTransportFareOptions`, `getRailFare`, `calculateFareOptionEstimates`, and `calculateDiscountedFare`; do not change fare formulas or effective-rule behavior.
- Produce a fare-card view model with exactly three passenger categories: `regular`, `student`, and `pwd`; each card holds its applicable amount(s), variant labels where multiple transport fare options exist, and source/verification detail when available.
- Regular fares use the existing regular estimate; Student and PWD use their existing discount rules. Do not show the current senior citizen category in these three cards.

- [ ] **Step 1: Write failing tests** named `buildFareCards groups current road estimates by Regular Student and PWD`, `buildFareCards retains multiple transport variants`, and `buildFareCards marks missing rules and estimates unavailable`.
- [ ] **Step 2: Run the fare-card tests and confirm they fail because the view-model builder is missing.**

Run: `npx vitest run src/lib/fareCalculations.test.ts`
Expected: FAIL because the new builder and card types do not exist.

- [ ] **Step 3: Implement and verify the fare-card view model**

Adapt the existing estimates without recalculating or rounding them differently. Keep unavailable data explicit; do not substitute another route's rule or fare.

- [ ] **Step 4: Replace fare table with three compact icon-led cards**

Hide all fare amounts/cards until both endpoint indexes resolve to stops on the active route and destination order is later than boarding. For rail, show the selected route's stored-value/single-journey fare values and applicable student/PWD discounts only after a station pair is selected. Keep loading, error, source, verification, area-unassigned, and unavailable messages visible as relevant.

- [ ] **Step 5: Verify Task 3**

Run: `npx vitest run src/lib/fareCalculations.test.ts src/lib/fares.test.ts`
Expected: fare calculation and card tests pass.
Run: `npx eslint src/lib/fareCalculations.ts src/lib/fareCalculations.test.ts src/pages/registered-user/Home/Home.tsx`
Expected: no lint errors.

---

### Task 4: Full regression and acceptance verification

**Files:**
- Verify all changed files; make only test-driven fixes required by failures.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all project test files and tests pass.

- [ ] **Step 2: Run focused ESLint, build, and whitespace checks**

Run: `npx eslint src/lib/routeMap.ts src/lib/routeMap.test.ts src/lib/routeGeometry.ts src/lib/routeGeometry.test.ts src/lib/routes.ts src/lib/routes.test.ts src/lib/fareCalculations.ts src/lib/fareCalculations.test.ts src/lib/fares.ts src/lib/fares.test.ts src/lib/mapIcons.ts src/pages/registered-user/Home/Home.tsx`
Expected: no lint errors.

Run: `npm run build`
Expected: TypeScript and Vite production build succeed.

Run: `git diff --check`
Expected: no whitespace errors.

- [ ] **Step 3: Exercise acceptance flow in a browser if a compatible browser is available**

Verify place click shows every serving route path, bus and jeepney remain distinct, selecting a route seeds only a valid clicked point, route search shows geometry without fares, invalid points do not change fares, valid boarding/destination show three separate passenger cards, and selecting a different route clears the prior pair. If no browser is available, record the limitation rather than claiming visual verification.
