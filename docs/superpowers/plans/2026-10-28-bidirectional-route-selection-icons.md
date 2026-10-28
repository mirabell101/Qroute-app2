# Bidirectional Route Selection and Vehicle Endpoint Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Allow a trip to board and alight at any two distinct stops on the selected route in either route order, and show the route's train, bus, or jeepney icon in the green/red endpoint markers instead of letters.

**Architecture:** Keep trip state in the existing route-map helpers and Home map page. Make endpoint selection direction-independent, compute road trip distance from the absolute difference between cumulative route distances, keep rail fares on the existing symmetric matrix lookup, and render mode glyphs in the endpoint icons.

**Tech Stack:** React, TypeScript, Leaflet, Lucide React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-bidirectional-route-selection-icons-design.md`

## Global Constraints

- Reuse existing React, Leaflet, Lucide icons, route geometry, and fare calculation logic; add no dependencies.
- Keep route IDs, stop sequence, actual coordinates, and fare rules unchanged.
- Preserve existing behavior for selecting the current boarding point again, which clears the trip.
- Keep existing route stop ordering, route geometry, map interactions, and non-endpoint markers unchanged.

## Review Focus

- Boarding at a later route stop and selecting an earlier destination must produce a valid trip and positive road distance.
- Forward-direction trips and destination updates must continue to work.
- Re-selecting the boarding point must clear the trip rather than show a zero-distance fare.
- Rail fare lookup must remain symmetric and receive the selected endpoint stop IDs.
- Endpoint markers must distinguish train, bus, and jeepney while green/red consistently represent boarding/destination and no “A”/“B” marker labels remain.

---

### Task 1: Make trip selection and route distance bidirectional

**Files:**
- Modify: `src/lib/routeMap.ts`
- Test: `src/lib/routeMap.test.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- `selectTripStop(selection: TripSelection, clickedIndex: number): TripSelection` keeps the first click as boarding, treats the same boarding index as a boarding reset, and treats any other valid index as destination.
- Add `getTripDistanceMeters(stopDistances: number[], boardingIndex: number | null, destinationIndex: number | null): number | null`, returning the absolute cumulative-distance difference for valid distinct indices and `null` for missing, invalid, same, or non-finite endpoints.

- [ ] **Step 1: Write failing route-selection tests**

  In `src/lib/routeMap.test.ts`, update the existing `selectTripStop` expectations and add assertions that boarding at index 3 then clicking index 0 sets destination 0; clicking another distinct earlier index updates that destination; clicking the boarding index resets destination; and invalid indices leave selection unchanged.

- [ ] **Step 2: Run focused tests and verify failure**

  Run: `npm test -- src/lib/routeMap.test.ts`

  Expected: FAIL because earlier route indices are currently treated as a new boarding point.

- [ ] **Step 3: Implement direction-independent `selectTripStop`**

  Preserve the current first-stop and same-boarding reset behavior. With a boarding index set, any different valid index becomes the destination.

- [ ] **Step 4: Add failing route-distance tests**

  Test `getTripDistanceMeters([0, 100, 300, 600], 3, 0) === 600`, forward endpoints return the same positive segment distance, same/missing/out-of-range endpoints return `null`, and non-finite endpoint distances return `null`.

- [ ] **Step 5: Run focused tests and verify the distance helper fails**

  Run: `npm test -- src/lib/routeMap.test.ts`

  Expected: FAIL because `getTripDistanceMeters` is not implemented.

- [ ] **Step 6: Implement and verify the distance helper**

  Add the specified pure helper to `src/lib/routeMap.ts`.

  Run: `npm test -- src/lib/routeMap.test.ts`

  Expected: PASS for forward and reverse selection and all distance edge cases.

- [ ] **Step 7: Use bidirectional trip validity in Home**

  In `Home.tsx`, define a valid trip as two distinct in-range stops on the selected route, remove the `destinationIndex > boardingIndex` requirement, and use `getTripDistanceMeters` for road routes. Keep the existing rail fare lookup and route-stop IDs unchanged. Update the no-fare guidance to say any other stop on the selected route can be chosen.

### Task 2: Show vehicle type in selected endpoint markers

**Files:**
- Modify: `src/lib/mapIcons.ts`
- Test: `src/lib/mapIcons.test.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- Add `MapVehicleType = "train" | "bus" | "jeepney"`.
- Add `getEndpointMapIcon(role: "boarding" | "destination", vehicleType: MapVehicleType): L.DivIcon`, returning the selected vehicle glyph with a green boarding background or red destination background.

- [ ] **Step 1: Write failing endpoint-icon tests**

  In `src/lib/mapIcons.test.ts`, assert for each vehicle type that boarding and destination icons have distinct vehicle glyphs, role colors (`#16a34a` and `#dc2626`), and contain neither the old “A” nor “B” label.

- [ ] **Step 2: Run the focused icon tests and verify failure**

  Run: `npm test -- src/lib/mapIcons.test.ts`

  Expected: FAIL because `getEndpointMapIcon` does not yet exist.

- [ ] **Step 3: Implement mode-specific endpoint icons**

  Implement `getEndpointMapIcon` in `src/lib/mapIcons.ts` using train, bus, and jeepney vector glyphs without adding dependencies. Preserve existing non-endpoint `getMapIcon` behavior.

- [ ] **Step 4: Run icon tests and verify they pass**

  Run: `npm test -- src/lib/mapIcons.test.ts`

  Expected: PASS for all three vehicle glyphs, role colors, and absence of letter labels.

- [ ] **Step 5: Wire selected route type into endpoint markers**

  In `Home.tsx`, derive the endpoint vehicle type from the selected route's transport type and use `getEndpointMapIcon` for boarding and destination. Keep marker accessibility text explicit about the stop name and endpoint role; leave all non-endpoint map markers unchanged.

### Task 3: Verify complete map behavior

**Files:**
- Verify: `src/lib/routeMap.ts`
- Verify: `src/lib/routeMap.test.ts`
- Verify: `src/lib/mapIcons.ts`
- Verify: `src/lib/mapIcons.test.ts`
- Verify: `src/pages/registered-user/Home/Home.tsx`

- [ ] **Step 1: Run the full test suite**

  Run: `npm test`

  Expected: all tests pass, including the new reverse-direction and endpoint-icon cases.

- [ ] **Step 2: Run targeted lint and production build**

  Run: `.\node_modules\.bin\eslint.cmd src\lib\routeMap.ts src\lib\routeMap.test.ts src\lib\mapIcons.ts src\lib\mapIcons.test.ts src\pages\registered-user\Home\Home.tsx`

  Run: `npm run build`

  Expected: targeted lint exits successfully; TypeScript and Vite build complete successfully.

- [ ] **Step 3: Check whitespace**

  Run: `git diff --check`

  Expected: no whitespace errors.
