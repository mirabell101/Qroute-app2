# Manual Map Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop requesting the device location automatically and let users pan to it on demand from a map control.

**Architecture:** Replace the mount-time `watchPosition` effect in `useTransitMap` with a one-shot requester invoked only by a location button in `TransitMapCanvas`. Keep the existing location marker and map camera behavior for explicit requests; leave route/place viewport effects and transit-data loading unchanged.

**Tech Stack:** React, TypeScript, React Leaflet, Leaflet, lucide-react, Vitest.

**Spec:** [2026-11-03-recent-search-account-transfer-manual-location-design.md](../specs/2026-11-03-recent-search-account-transfer-manual-location-design.md)

## Global Constraints

- Preserve the map default center `[14.7167, 121.05]` and zoom `14`.
- Do not request geolocation on initial render or map-data refresh.
- Request location only after an explicit button click; do not use `watchPosition`.
- Do not refetch routes, stops, or terminals for a location action.
- Preserve route/place selection camera behavior and the existing map library.
- Show concise errors for denied, unsupported, unavailable, and timed-out location.
- Ignore repeated clicks while one request is pending.

## Review Focus

- Geolocation is unsupported → do not throw during render; show a friendly error only after the user asks.
- Permission denial/unavailable/timeout → release the in-flight lock and permit another explicit attempt.
- Repeated click while pending → make one browser request, pan once after resolution.
- Same coordinates returned after the user pans away → still fly to the location on the new click.
- Route or place selection after location → preserve the existing route/place viewport behavior.

---

### Task 1: Make Location Requests Explicit and One-Shot

**Files:**
- Create: `src/lib/currentLocation.ts`
- Create: `src/lib/currentLocation.test.ts`
- Modify: `src/components/transit-map/useTransitMap.ts`

**Interfaces:**
- Produces: `createCurrentLocationRequester(geolocation: Pick<Geolocation, "getCurrentPosition"> | null): () => Promise<Coordinates>`, where each requester coalesces overlapping calls and starts a fresh request after settlement.
- Produces: `TransitMapController.requestCurrentLocation(): Promise<void>` and an idle initial location status.

- [ ] **Step 1: Write failing tests** proving the requester is lazy, calls `getCurrentPosition` once per pending batch, resolves coordinates, rejects unsupported browsers and mapped browser errors, and can be called again after a failure or success.
- [ ] **Step 2: Run the tests and verify they fail because the requester is not implemented.**

Run: `npm test -- src/lib/currentLocation.test.ts`

- [ ] **Step 3: Implement the one-shot requester** with existing accuracy/timeout options and concise errors; coalesce in-flight calls without a timer or `watchPosition`.
- [ ] **Step 4: Replace the mount-time watcher in `useTransitMap`** with an explicit controller action. Set status/loading and the transient message only after that action is invoked; update `currentPosition` on success and always release the in-flight state.
- [ ] **Step 5: Run the focused tests** and confirm no geolocation permission request occurs merely by creating the requester/controller.

Run: `npm test -- src/lib/currentLocation.test.ts`

Expected: all location-request tests pass; no `watchPosition` remains in the map hook.

### Task 2: Add the Map Control and Preserve Camera Behavior

**Files:**
- Create: `src/components/transit-map/currentLocationViewport.ts`
- Create: `src/components/transit-map/currentLocationViewport.test.ts`
- Modify: `src/components/transit-map/TransitMapCanvas.tsx`
- Modify: `src/components/transit-map/useTransitMap.ts`

**Interfaces:**
- Consumes: Task 1's `TransitMapController.requestCurrentLocation()`.
- Produces: a map button with accessible name `Show my location`; on an explicit successful request, the existing current-location marker and camera move to zoom 16.

- [ ] **Step 1: Write failing tests** for the camera helper calling `flyTo(coords, 16)` on a location update, preserving fresh updates for identical coordinates, and not affecting route/place viewport helpers.
- [ ] **Step 2: Run the tests and verify the missing camera behavior fails for the expected reason.**

Run: `npm test -- src/components/transit-map/currentLocationViewport.test.ts`

- [ ] **Step 3: Implement the camera helper** and have the location marker invoke it only when the controller has a position from a manual request.
- [ ] **Step 4: Add a recognizable `LocateFixed` button** over the map, consistently offset from the upper-right edge. Disable it while loading and connect its click to `requestCurrentLocation`; keep status messages at their existing location.
- [ ] **Step 5: Run the focused location and route-map tests.**

Run: `npm test -- src/lib/currentLocation.test.ts src/components/transit-map/currentLocationViewport.test.ts src/lib/routeMap.test.ts`

Expected: all selected tests pass; the initial view remains at the default center/zoom and existing route/place selections still use their current viewport effects.

### Task 3: Verify the Map Change

**Files:**
- No additional source files.

- [ ] **Step 1: Run `npm test`, `npm run lint`, and `npm run build`.** Record existing baseline failures separately and fix any failures caused by this change.
- [ ] **Step 2: Review all map camera/geolocation call sites** to confirm no automatic request remains and data refresh paths do not change viewport.
- [ ] **Step 3: Perform a browser interaction check if browser tooling is available**; report any environment limitation rather than claiming an unperformed click test.

Expected: all applicable checks confirm explicit-only location requests and no changes to route/place selection behavior.
