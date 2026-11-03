# Shared Transit Map and Fare Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse Home's route discovery, trip selection, and fare experience on all three pages, remove unused fare metadata, and safely enable anonymous transit/fare reads.

**Architecture:** Move the map and its route/trip/fare state into one shared `TransitMapExperience` component, leaving each page's account shell and authentication callbacks separate. Keep existing route/fare libraries as the data and calculation layer, and use one forward-only Supabase migration for the narrowly scoped schema and RLS changes.

**Tech Stack:** React 19, TypeScript, React Leaflet/Leaflet, Supabase PostgreSQL RLS, Vitest, ESLint, Vite.

**Spec:** `docs/superpowers/specs/2026-10-28-shared-transit-map-and-fare-metadata-design.md`

## Global Constraints

- Do not inspect or modify secret files.
- Do not alter user credentials, `profiles`, or authentication.
- Do not change route, terminal, or stop approval/moderation behavior.
- Do not expose unapproved, deleted, or banned route/stop/terminal records to anonymous visitors.
- Do not expose author IDs, moderation notes, or moderation/audit fields through anonymous column grants.
- Do not grant anonymous access to profiles, user records, or write operations.
- Keep each route's own identity, geometry, transport type, fare model, and configured `transport_types.color`.
- Keep selected boarding and destination markers green and red, respectively.
- Do not delete fare rows, fare values, fare dates, fare variants, or fare calculation behavior.
- Preserve historical migrations rather than rewriting applied history.

## Review Focus

- Same-place stops served by multiple vehicle modes — each remains independently visible and selectable. Test in Task 3.
- Selecting an endpoint on a colored rail route — the endpoint remains role-colored while the route path and other vehicle markers use the route's configured color. Test in Task 3.
- Reverse-direction trips and selecting a new route — boarding/destination and fare state remain consistent. Reuse/extend existing route map tests in Task 3.
- Anonymous reads of pending, deleted, or banned transit submissions — these must remain invisible. Verify RLS in Task 2.
- Fare lookup after metadata columns are removed — fares/discount calculations still work and the schema change does not delete rows. Verify query tests and live schema/counts in Tasks 1-2.

---

### Task 1: Remove Fare Source Metadata from the App

**Files:**
- Modify: `src/lib/fares.ts`
- Modify: `src/lib/fareCalculations.ts`
- Modify: `src/lib/fares.test.ts`
- Modify: `src/lib/fareCalculations.test.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- Preserve `FareRule`, `FareDiscountRule`, `RailFare`, `TransportFareOption`, and `FareCard` fare-calculation fields.
- Remove `VerificationStatus` and `FareCardSource` only if no remaining application use exists after the UI changes.
- `buildFareCards(estimates, railFare, selectedRailVariantId)` continues returning Regular, Student, and PWD categories, with fare amounts and unavailable reasons but no `sources` property.

- [ ] **Step 1: Update fare tests first**

Remove source/URL/notes/status fields from fare test fixtures. Add assertions that `buildFareCards` still computes all three fare categories and amounts without source metadata, and that unavailable fare/discount messaging is preserved. Update `fares.test.ts` to assert the discount-rule select list omits the removed columns.

- [ ] **Step 2: Run focused tests and confirm the intended failure**

Run: `npm test -- src/lib/fares.test.ts src/lib/fareCalculations.test.ts`

Expected: Type or assertion failures identify remaining application dependencies on fare metadata.

- [ ] **Step 3: Remove source metadata from types and queries**

In `src/lib/fares.ts`, remove source/status/note properties from fare interfaces and remove `source_name`, `source_url`, and `verification_status` from the `fare_discount_rules` select. Keep dates, deleted flags, fare values, and discount values.

- [ ] **Step 4: Simplify fare-card construction and display**

In `src/lib/fareCalculations.ts`, remove `FareCardSource`, its source conversion helpers, and `sources` from fare-card output. In `Home.tsx`, remove `FareSource`, source list rendering, and imports used only by the removed source/verification display. Preserve fare amount labels, passenger category icons, fare errors, and effective fare selection.

- [ ] **Step 5: Run focused fare tests**

Run: `npm test -- src/lib/fares.test.ts src/lib/fareCalculations.test.ts`

Expected: PASS; distance, discount, rail matrix, and missing-rule behavior remain unchanged without source metadata.

### Task 2: Apply Fare Schema and Anonymous Read Policies

**Files:**
- Create: `supabase/migrations/20261028_shared_public_transit_and_fare_cleanup.sql`
- Modify: `supabase/seeds/reset_and_seed_qc_mrt3.sql`
- Modify: `src/lib/routes.ts`
- Modify: `src/lib/routes.test.ts`

**Interfaces:**
- The migration uses the live QROUTE public schema already inspected; do not infer missing columns or alter unrelated tables.
- It drops only `source_name`, `source_url`, `verification_status`, and `notes` from `fare_rules` and `rail_fares`, and only `source_name`, `source_url`, and `verification_status` from `fare_discount_rules`.
- Anonymous access is SELECT-only. Existing authenticated write policies and grants remain unchanged.
- `getRouteDetails(routeId, includeOwner = true)` omits `created_by`, `is_approved`, and `moderation_status` from its anonymous projection when `includeOwner` is false; callers use that mode for logged-out visitors.

- [ ] **Step 1: Add a forward-only migration**

Drop only the confirmed fare metadata columns above. Add `anon` SELECT grants and RLS policies for the shared map's required public data: `routes`, `stops`, `terminals`, `route_stops`, `transport_types`, `transport_variants`, `fare_areas`, `fare_rules`, `fare_rule_distance_bands`, `fare_discount_rules`, and `rail_fares`.

Use predicates that require routes, stops, and terminals to be active, approved, `moderation_status = 'approved'`, not deleted, and not banned. Route-stop rows must reference a route meeting the same visibility conditions. Restrict variants to active rows; fare rules, discounts, and rail fares to non-deleted rows; distance bands to non-deleted fare rules. Use column-level `anon` SELECT grants to expose only map/fare fields, not author IDs, moderation notes, or moderation/audit fields. Keep route-owner lookup available only to authenticated callers. Add no anonymous write policies/grants and no policy or grant for `profiles` or user tables.

- [ ] **Step 2: Remove dropped-column references from the MRT-3 seed**

Remove the dropped metadata columns and their associated values from seed inserts for `rail_fares` and `fare_discount_rules`. Preserve station, route, fare amounts, effective dates, and discount percentages.

- [ ] **Step 3: Add separate public and owner route projections**

Update `RouteDetails` so owner/moderation-only fields can be absent for anonymous results. Add `getRouteDetails(routeId: number, includeOwner = true)` with a public projection that excludes `created_by`, `is_approved`, and `moderation_status` when `includeOwner` is false; preserve the current owner projection when true. Add a `routes.test.ts` assertion that the public projection does not request those fields and the owner projection still supplies them.

- [ ] **Step 4: Run route projection tests**

Run: `npm test -- src/lib/routes.test.ts`

Expected: PASS for both projections, with no change to route stop ordering or filtering.

- [ ] **Step 5: Review SQL scope before applying**

Confirm the migration does not drop tables, delete/truncate rows, modify `profiles` or auth tables, or change route/stop/terminal approval behavior. Confirm each new policy is for `anon` SELECT only and does not broaden writes.

- [ ] **Step 6: Apply the migration to QROUTE after review**

Run the migration through Supabase MCP `apply_migration` against project `qkipjkahjmzukkcakvpy`. Do not read `.env` or other secret files.

- [ ] **Step 7: Verify the schema and public policies**

Use read-only catalog queries to verify the named fare columns are absent; all other fare columns remain; `anon` has only the intended SELECT policies/grants; each public transit predicate filters unapproved/inactive/deleted/banned records; and no profile/user policies changed. Compare row counts for the three fare tables before and after if obtainable without selecting row contents.

### Task 3: Keep Route Colors Consistent on the Map

**Files:**
- Modify: `src/lib/mapIcons.ts`
- Modify: `src/lib/mapIcons.test.ts`
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- `getVehicleMapIcon(vehicleType: MapVehicleType, color: string, displayOffsetX?: number): L.DivIcon` renders the glyph and exact supplied route color.
- `getEndpointMapIcon(role, vehicleType)` remains green for boarding and red for destination, per the user's choice.

- [ ] **Step 1: Add/adjust icon tests**

Test route colors representative of configured route colors, including an LRT route color, and assert ordinary train/bus/jeepney markers render that exact color. Keep assertions that boarding is green, destination is red, and each glyph remains mode-specific.

- [ ] **Step 2: Run the icon tests and verify failure if route colors are not preserved**

Run: `npm test -- src/lib/mapIcons.test.ts`

Expected: PASS; if it fails, it must specifically identify a marker fill mismatch.

- [ ] **Step 3: Ensure shared map markers and paths use each route color**

Preserve `route.transport_types.color` on ordinary route-associated markers and use the same value for that route's polyline. Do not apply a default blue in place of a configured color. Selected boarding/destination markers retain green/red role colors; overlapping modes stay separate.

- [ ] **Step 4: Rerun icon and route selection tests**

Run: `npm test -- src/lib/mapIcons.test.ts src/lib/routeMap.test.ts`

Expected: PASS, including separate route identity, distinct mode glyphs, role colors, and existing bidirectional stop selection.

### Task 4: Extract and Reuse the Full Map Experience

**Files:**
- Create: `src/components/map/TransitMapExperience.tsx`
- Modify: `src/pages/registered-user/Home/Home.tsx`
- Modify: `src/pages/admin/base/base.tsx`
- Modify: `src/pages/visitor/Landing/Landing.tsx`
- Modify: existing map/route tests only where extraction reveals a missing pure behavior test.

**Interfaces:**
- Export `TransitMapExperienceProps` with:
  - `currentUserId: string | null`
  - `onRequireSignIn?: () => void`
  - `onEditRoute?: (routeId: number) => void`
- Export `TransitMapExperience(props: TransitMapExperienceProps): JSX.Element`.
- The shared component owns route/place search, map data/loading/error state, route geometry display, stop/terminal interaction, trip selection, fare retrieval, fare estimates, route detail/fare panel, and optional current-location display.
- Page components retain their existing account shell, navigation, login/profile/logout controls, and page-specific buttons.

- [ ] **Step 1: Identify the existing behavior tests to preserve**

Run the current route-map, route geometry, map icon, fare, and fare calculation test files before extraction. Record the passing baseline; do not change unrelated behaviors.

- [ ] **Step 2: Extract the map and trip/fare behavior into the shared component**

Move Home-owned map data effects, route selection and geometry logic, marker handlers, search, trip selection, fare lookup, and map/detail/fare JSX into `TransitMapExperience`. Reuse `routes.ts`, `routeMap.ts`, `routeGeometry.ts`, `fares.ts`, `fareCalculations.ts`, `mapIcons.ts`, and `mapImages.ts`; do not duplicate database requests or fare logic. Keep page shells outside this component.

- [ ] **Step 3: Preserve Home-only actions through callbacks**

Render the shared component from Home. Pass the current user ID, a callback that opens Home's existing sign-in prompt, and a route-edit callback that preserves the existing contribution URL behavior. Keep the existing Home account sidebar/header and other account state outside the shared component. Preserve authenticated ownership checks; never require an anonymous projection to request or receive `created_by`.

- [ ] **Step 4: Replace the static map on admin/Base**

Render the shared experience in place of Base's default map marker. Keep Base's navigation, admin links, header, and session behavior unchanged. Pass `currentUserId={null}` and omit authentication callbacks unless Base already has a safe page-level source for them.

- [ ] **Step 5: Replace the static map on visitor/Landing**

Render the same shared experience in place of Landing's default map marker. Pass its existing `currentUserId` and wire `onRequireSignIn` to the current login prompt. Keep visitor navigation, login/profile behavior, and auth gating unchanged. Use only anonymous SELECT policies/column grants when logged out; do not broaden access to profile or author/moderation data.

- [ ] **Step 6: Run route, fare, and map tests**

Run: `npm test -- src/lib/routeMap.test.ts src/lib/routeGeometry.test.ts src/lib/mapIcons.test.ts src/lib/fares.test.ts src/lib/fareCalculations.test.ts`

Expected: PASS, including all existing bidirectional trip and fare behavior after the component is shared.

### Task 5: Verify All Three Page Integrations

**Files:**
- Verify: `src/components/map/TransitMapExperience.tsx`
- Verify: `src/pages/registered-user/Home/Home.tsx`
- Verify: `src/pages/admin/base/base.tsx`
- Verify: `src/pages/visitor/Landing/Landing.tsx`
- Verify: all changed migration, seed, library, and test files.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all test files pass.

- [ ] **Step 2: Lint changed TypeScript files**

Run: `npx eslint src/components/map/TransitMapExperience.tsx src/pages/registered-user/Home/Home.tsx src/pages/admin/base/base.tsx src/pages/visitor/Landing/Landing.tsx src/lib/fares.ts src/lib/fareCalculations.ts src/lib/mapIcons.ts src/lib/fares.test.ts src/lib/fareCalculations.test.ts src/lib/mapIcons.test.ts`

Expected: exit code 0.

- [ ] **Step 3: Build and verify the diff**

Run: `npm run build; if ($?) { git diff --check }`

Expected: TypeScript and Vite build succeed; `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Smoke-test each page**

Verify Home, admin/Base, and visitor/Landing show the same route/place search, separate transit-mode markers, route-colored lines/markers, route details, bidirectional trip selection, and Regular/Student/PWD fares. Test Landing logged out and confirm only approved public routes/stops/terminals and non-deleted fare data are visible. Confirm Home's sign-in prompt and route-edit behavior still work.
