# Map Line Clearing and MRT-3 Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide route lines when a trip is cleared or its boarding point is tapped again, and provide a guarded, reviewable SQL script to replace the demo transit rows with a Quezon City MRT-3 sample segment.

**Architecture:** Keep map line visibility separate from selected route/place state in `Home.tsx`, with pure route-map helpers proving the visibility and repeated-boarding rules. Add a one-time Supabase SQL seed/reset script that checks the expected demo dataset before deleting dependent data and inserts sourced MRT-3 station, route, fare, and discount rows. The SQL script is delivered but never executed against Supabase.

**Tech Stack:** React, TypeScript, Leaflet/React-Leaflet, Vitest, Supabase PostgreSQL SQL.

**Spec:** `docs/superpowers/specs/2026-10-28-map-line-clear-and-mrt3-sample-design.md`

## Global Constraints

- Do not read `.env` or other sensitive files.
- Do not execute data-changing SQL against the connected Supabase project.
- Delete only the selected transit data: routes, route-stop links, stops, terminals, and rail fares; preserve transport types/variants and general fare rules.
- Use the existing Train transport type and rail matrix variant; fail clearly if IDs are missing or ambiguous.
- Use the secondary MRT-3 base fare matrix and mark its source `secondary`, not verified.
- Preserve Student/PWD fare handling as separate 20% discount rules marked unverified for this rail service.
- Do not invent route geometry or road data; there is no roads table, and road geometry remains map-generated.
- Keep place/route details and map markers when route lines are hidden.

## Review Focus

- A selected route ID must not keep its polyline visible after Clear trip; test that hidden visibility yields no displayed route IDs.
- Repeating the current boarding point must clear both trip endpoints and hide lines; test detection for a matching boarding index and non-matching/no boarding index.
- A new marker or route search after clearing must show only its relevant routes; test visible IDs are unique and selected route is not duplicated.
- The script must abort before deleting if the expected demo dataset is not present; include a transaction guard checking route/route-stop/stop/terminal identities and counts.
- Rail fare pairs must reflect ordered station gaps without storing duplicate directions; validate all six station pairs and expected fares (₱13 for gaps 1–2, ₱16 for gap 3).

---

### Task 1: Make route-line visibility temporary

**Files:**
- Modify: `src/lib/routeMap.ts`
- Test: `src/lib/routeMap.test.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- Produce `isRepeatedBoardingPoint(selection: TripSelection, clickedIndex: number): boolean`; true only when a boarding point exists and the clicked index equals it.
- Produce `getDisplayedRouteIds(visibleRouteIds: number[], selectedRouteId: string, routeLinesVisible: boolean): number[]`; return no IDs when hidden, otherwise unique visible IDs plus the selected route ID if present.
- `Home.tsx` owns the visibility flag and calls the helpers for rendering and marker-click state transitions.

- [ ] **Step 1: Write failing helper tests** in `src/lib/routeMap.test.ts`.

  Add tests asserting:
  - `isRepeatedBoardingPoint({ boardingIndex: 2, destinationIndex: null }, 2)` is true.
  - A different clicked index, or a null boarding index, returns false.
  - `getDisplayedRouteIds([10, 11], "10", false)` is `[]`.
  - `getDisplayedRouteIds([10, 11], "10", true)` is `[10, 11]`.
  - `getDisplayedRouteIds([], "12", true)` is `[12]`.

- [ ] **Step 2: Run the focused tests and verify failure.**

  Run: `npm test -- src/lib/routeMap.test.ts`

  Expected: FAIL because the new helpers are not exported.

- [ ] **Step 3: Implement the pure helpers in `src/lib/routeMap.ts`.**

  Use the exact signatures above, deduplicate route IDs while preserving their existing order, and return `[]` when `routeLinesVisible` is false.

- [ ] **Step 4: Run the focused tests and verify they pass.**

  Run: `npm test -- src/lib/routeMap.test.ts`

  Expected: PASS, including the new visibility and repeat-boarding cases.

- [ ] **Step 5: Wire visibility transitions in `Home.tsx`.**

  Add `routeLinesVisible` state. Set it true when `loadVisibleRouteLayers` is asked to show relevant routes and when a route line is selected. Use `getDisplayedRouteIds` for `displayedRouteIds`. In `clearTrip`, clear both endpoints and hide the lines without clearing `selectedPlacePoint`, `selectedRouteId`, route details, or markers. In `handlePlaceSelect`, detect a repeated active boarding index before calling `handleTripStop`; on a repeat, call `clearTrip`. Keep other existing route-selection and endpoint behavior intact.

- [ ] **Step 6: Verify the affected code.**

  Run: `npm test -- src/lib/routeMap.test.ts`

  Expected: PASS. Confirm by code inspection that Clear trip/repeat boarding only gates route polylines, later map selections restore the relevant lines, and route-only search does not create endpoints or fares.

---

### Task 2: Create the guarded MRT-3 reset/seed SQL

**Files:**
- Create: `supabase/seeds/reset_and_seed_qc_mrt3.sql`

**Interfaces:**
- The SQL script is the user-facing deliverable; it must not be executed against the connected Supabase database.
- It resolves the Train transport type and rail matrix variant through `transport_types.name` and `transport_variants.code`/`fare_model`, requiring exactly one match for each.

- [ ] **Step 1: Add a destructive-scope header and fail-fast preconditions.**

  Document that the script replaces transit data and does not alter identity sequences, general fare rules, transport references, or roads. Start a transaction and add a `DO` guard that raises an exception unless the current demo set matches the known reset precondition: exactly one route named `Demo QC Jeepney Route`, its five linked route-stop rows, exactly the three known demo stops and two known demo terminals, no other route/stop/terminal rows, no map images tied to the demo stops/terminals (the foreign keys cascade on delete), and no existing rail fares or rail-variant discount rows. Resolve Train/rail IDs and fail if either lookup is missing or ambiguous. This guard must run before any deletion.

- [ ] **Step 2: Add ordered deletion and MRT-3 seed inserts.**

  Delete the guarded demo's `rail_fares`, `route_stops`, `routes`, `stops`, and `terminals` in dependency-safe order, with every delete constrained to the guarded route or known demo stop/terminal IDs. Insert four approved/active `train_station` stops in route order:
  - North Avenue: `14.6521641, 121.0322409`
  - Quezon Avenue: `14.6422956, 121.0387658`
  - GMA Kamuning: `14.6353731, 121.0432650`
  - Araneta-Cubao: `14.6199760, 121.0510969`

  Use the corresponding OpenStreetMap results (the Cubao result is the node named “MRT Cubao Station”): `https://www.openstreetmap.org/way/222628892`, `https://www.openstreetmap.org/way/128196488`, `https://www.openstreetmap.org/way/30262758`, and `https://www.openstreetmap.org/node/14139719118`. Then insert one approved/active route named `MRT-3 Quezon City Sample Segment`, using the Train type ID and active rail matrix variant resolved by code/model and transport-type relationship. Link the four stops with `stop_order` 1–4 and set all required moderation fields consistently with approved data.

- [ ] **Step 3: Seed fares and applicable discounts with provenance.**

  Insert one row per unordered station pair (six rows total) into `rail_fares`, using equal stored-value/single-journey fares: North Avenue–Quezon Avenue ₱13, North Avenue–GMA Kamuning ₱13, North Avenue–Cubao ₱16, Quezon Avenue–GMA Kamuning ₱13, Quezon Avenue–Cubao ₱13, and GMA Kamuning–Cubao ₱13. Use `effective_from = '2015-01-04'` and `verification_status = 'secondary'`. Add 20% Student and PWD discount rows for the rail variant with `effective_from = '2026-10-27'`, matching the current configured discount policy, and mark them `unverified`; preserve existing general and road fare-rule rows. Add SQL comments containing the secondary fare-guide URL (`https://mrt3.com/index.php/menu-fare-tickets.html`), station-coordinate OpenStreetMap links and attribution, and the known uncertainty that the fare matrix is secondary.

- [ ] **Step 4: Close the transaction and review the script without applying it.**

  End with `COMMIT`. Review that all writes are behind the precondition guard, no broad deletes omit a `WHERE` condition tied to the guarded demo set, and there is no `ALTER SEQUENCE`, `TRUNCATE`, or write to the connected database during implementation.

---

### Task 3: Verify the combined deliverable

**Files:**
- Verify: `src/lib/routeMap.ts`
- Verify: `src/lib/routeMap.test.ts`
- Verify: `src/pages/registered-user/Home/Home.tsx`
- Verify: `supabase/seeds/reset_and_seed_qc_mrt3.sql`

- [ ] **Step 1: Run the full test suite.**

  Run: `npm test`

  Expected: all Vitest tests pass.

- [ ] **Step 2: Run lint and production build.**

  Run: `npm run lint`

  Expected: ESLint exits successfully.

  Run: `npm run build`

  Expected: TypeScript and Vite build complete successfully; a bundle-size advisory is acceptable if unchanged from baseline.

- [ ] **Step 3: Check whitespace and scope.**

  Run: `git diff --check`

  Expected: no whitespace errors. Confirm the diff contains only the planned map/test and SQL seed changes, with no sensitive files or live Supabase writes.
