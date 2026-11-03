# Route Selection and Fare Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home route dropdown with a clickable route list and show sourced fare estimates for each variant under the selected transport type and fare area, including configured student, senior, and PWD discount estimates.

**Architecture:** Keep route/stop loading and map geometry in the existing Home page. Extend fare utilities with pure tiered-distance and discount calculations plus Supabase readers for all variants matching the selected route's type and fare area. Provide additive SQL for fare areas, fare bands, and effective-dated discount rules; the user will run this script in Supabase.

**Tech Stack:** React 19, TypeScript 6, Supabase JS, Leaflet / React-Leaflet, Vitest for pure fare tests, PostgreSQL SQL Editor.

**Spec:** `docs/superpowers/specs/2026-10-27-route-selection-and-jeepney-fares-design.md`

## Global Constraints

- Do not collect passenger identity or require users to select an eligibility category; discounts are informational comparisons only.
- Do not claim that every variant operates on the selected route.
- Do not hardcode variant surcharges, fare rates, discount percentages, or official-source claims in the frontend.
- Load applicable transport variants and active fare/discount rules based on the selected route's transport type, not only its default variant.
- Show "Fare unavailable" when a variant has no active applicable fare rule.
- Label comparisons as estimates and not confirmation of route availability for each variant.
- Round displayed road-transport estimates to the nearest whole peso while retaining original calculated precision internally.
- Existing railway fares remain station-pair matrix based; configured applicable discounts may be displayed as estimates without changing the matrix lookup.
- Necessary database extensions are in scope: represent fare areas linked to routes and fare rules, multiple distance-rate bands per fare rule, and effective, sourced discount rules.
- Use only active fare rules whose fare area matches the selected route's area. Do not silently use unscoped or differently scoped rules; routes or rules without an area must produce an unavailable estimate until configured.
- Passenger discounts should be configured in Supabase (including the standard 20% where supported), rather than hardcoded in the frontend. The frontend must indicate unavailable or unverified discount rules.
- Preserve fare source attribution, effective dates, route/stop selection, filtering, and map rendering. Avoid unrelated schema or product changes.

## Review Focus

- **A route or fare rule lacks an area, or areas differ:** do not apply the rule; test in Task 3.
- **A trip lies partly across multiple succeeding-distance bands:** price only the overlap with each band; test in Task 2.
- **A fare rule has a gap or does not cover the trip distance:** return an unavailable estimate rather than a partial or invented price; test in Task 2.
- **A rule is effective today at its start date or end date:** include the start date and exclude the end date; test in Task 3.
- **Discount calculation yields cents near a whole-peso boundary:** retain calculated precision and round only the display amount; test in Task 2.

---

### Task 1: Add Supabase Fare-Area, Fare-Band, and Discount SQL

**Files:**
- Create: `supabase/migrations/20261027_fare_comparison_rules.sql`

**Interfaces:**
- Consumes: Existing `public.routes`, `public.fare_rules`,
  `public.transport_variants`, `public.is_moderator()`, and Supabase
  `authenticated` role from the supplied schema.
- Produces: `public.fare_areas`, nullable `fare_area_id` foreign keys on routes
  and fare rules, `public.fare_rule_distance_bands`, and
  `public.fare_discount_rules`, readable by authenticated users and writable by
  moderators under RLS.

- [ ] **Step 1: Write additive fare-area and fare-band SQL**

Create `fare_areas` with identity primary key, unique name, optional description,
and creation timestamp. Add nullable `fare_area_id` foreign keys to `routes` and
`fare_rules`; existing rows remain unassigned and must not be matched as a
global fallback. Replace the old `(variant_id, effective_from)` uniqueness with
unique indexes supporting both scoped rules `(variant_id, fare_area_id,
effective_from)` and unscoped rules `(variant_id, effective_from)`.

Create `fare_rule_distance_bands` with a foreign key to `fare_rules`, inclusive
lower distance, exclusive optional upper distance, non-negative per-km rate,
and unique lower boundary per fare rule.

- [ ] **Step 2: Add discount rules, access policies, and safe backfills**

Create `fare_discount_rules` with a variant, passenger category
(`student`, `senior_citizen`, `pwd`), percentage, effective dates, source
name/URL, verification status, soft-delete flag, and uniqueness by
variant/category/effective start date.

Enable RLS and authenticated reads for fare areas, distance bands, and discount
rules; allow moderators to manage them, following the existing fare table
policies. Backfill one open-ended distance band per existing fare rule using
`base_distance_km` and `per_km_rate`. Insert effective-dated 20% discount rows
for active variants and the requested categories, with source references to
the applicable official legislation and `unverified` status pending operator
fare-rule verification. Use idempotent conflict handling. Do not assign routes
or fare rules to a region without evidence of their applicability.

- [ ] **Step 3: Review the SQL as a user-run Supabase script**

Check foreign keys, partial unique indexes, check constraints, indexes, RLS
policies, grants, and upsert conflict targets against the schema in the approved
design. Confirm the script does not drop/overwrite existing tables or data.
Include a query/example for adding a fare area and assigning the correct area to
both a route and its fare rules. Do not execute it against a remote Supabase
project.

- [ ] **Step 4: Run repository whitespace validation**

Run: `git diff --check -- supabase/migrations/20261027_fare_comparison_rules.sql`
Expected: no whitespace errors.

### Task 2: Implement and Test Fare Estimate Calculations

**Files:**
- Modify: `package.json`
- Create: `src/lib/fareCalculations.ts`
- Test: `src/lib/fareCalculations.test.ts`

**Interfaces:**
- Consumes: Existing `FareRule` shape; fare band rows and discount percentages
  supplied by Task 3.
- Produces:
  - `calculateDistanceFare(rule: FareRule, bands: FareDistanceBand[], distanceMeters: number): FareEstimate | null`
  - `calculateDiscountedFare(calculatedFare: number, discountPercent: number): DiscountEstimate`
  - `roundFareForDisplay(calculatedFare: number): number`
  - `FareEstimate` retains `calculatedFare` (unrounded), `displayFare`, `distanceKm`,
    and `extraKm`.
  - `DiscountEstimate` retains `calculatedFare` (discount applied to the
    unrounded regular fare before display rounding) and `displayFare`.

- [ ] **Step 1: Add Vitest and write failing fare calculation tests**

Add Vitest as a dev dependency and a `test` script. Test:

1. A 6 km ride with a 4 km base and bands 2.00/km from 4 km to 5 km, then
   2.40/km from 5 km onward, yields base fare plus 1 km at each rate.
2. A gap in the required distance bands returns `null`.
3. Overlapping required distance bands return `null` because the pricing is
   ambiguous.
4. A band ending exactly at the trip distance contributes no distance from the
   next band.
5. A 20% discount is applied to the unrounded calculated fare, while the
   display amount rounds independently to the nearest whole peso.
6. Half-peso display values round upward; amounts below/above the midpoint
   round to the nearest peso.

- [ ] **Step 2: Run tests and verify the expected failures**

Run: `npm test -- src/lib/fareCalculations.test.ts`
Expected: FAIL because the calculator module/functions do not yet exist.

- [ ] **Step 3: Implement typed pure calculation helpers**

Add `FareDistanceBand`, `FareEstimate`, and `DiscountEstimate` types and the
three functions defined above. Treat distance ranges as `[lower, upper)` with a
null upper limit as open-ended. Sum overlap of each band with the post-base
portion of the trip. Return `null` if any required post-base distance is
uncovered. Do not round until `roundFareForDisplay`; do not provide a fallback
rate for missing bands.

- [ ] **Step 4: Run the targeted tests**

Run: `npm test -- src/lib/fareCalculations.test.ts`
Expected: all fare calculation tests PASS.

### Task 3: Load Fare-Area-Matched Variants and Active Rules

**Files:**
- Modify: `src/lib/fares.ts`
- Modify: `src/lib/routes.ts`
- Test: `src/lib/fares.test.ts`

**Interfaces:**
- Consumes: `FareDistanceBand` and fare estimate types from Task 2.
- Produces:
  - `getTransportFareOptions(transportTypeId: number, fareAreaId: number | null, day?: string): Promise<TransportFareOption[]>`
  - Each `TransportFareOption` contains active variant metadata, the active
    fare rule or `null`, its distance bands, and effective discount rules by
    passenger category.
  - `RouteDetails.transport_type_id: number` and `RouteDetails.fare_area_id:
    number | null`.

- [ ] **Step 1: Add failing tests for active-rule and area resolution**

Test start-date inclusion, end-date exclusion, latest effective rule selection,
a same-type variant with no rule remaining in the results with `fareRule: null`,
and exclusion of inactive variants/deleted rules. Test that null route area and
different fare-rule area never match. Mock the Supabase client in
`fares.test.ts`; tests must not load environment files or contact a Supabase
project.

- [ ] **Step 2: Run the targeted tests**

Run: `npm test -- src/lib/fares.test.ts`
Expected: FAIL because the variant reader and area matching do not yet exist.

- [ ] **Step 3: Implement Supabase readers and route identifiers**

Extend `getRouteDetails` to select and return `transport_type_id` and
`fare_area_id`. Query active variants by transport type; query fare rules only
for an exact non-null match to the selected route's fare area, then load their
current bands and applicable current discount rules. Resolve the most recent
effective rule per variant/category, include variants with no current fare rule,
and throw explicit Supabase errors. If the route has no area, return all active
variants with no matched fare rule. Keep the existing rail matrix fetch path
intact.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- src/lib/fares.test.ts`
Expected: all active-rule and area-resolution tests PASS.

### Task 4: Replace the Dropdown with Clickable Routes

**Files:**
- Modify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- Consumes: Existing route list and `getRouteDetails` plus
  `getTransportFareOptions` from Task 3.
- Produces: Route cards/buttons that set the existing selected route ID; route
  list remains visible when details are shown.

- [ ] **Step 1: Replace the `<select>` route control with clickable route entries**

Keep the current routes query, ordering, and active/deleted/banned filters.
Expose selection with a button per route and accessible selected state. Keep the
route list visible beside selected details; make the list/details layout
responsive without removing existing map/stop/boarding behavior.

- [ ] **Step 2: Load and display variant fare comparisons**

After route details load, use its transport type and fare area to load all
applicable variants and rules. For a selected boarding/destination segment, show
a comparison table with each variant, regular estimate, and student/senior/PWD
discount estimates. If no trip segment is selected, prompt the user to select
boarding and destination. Show "Fare unavailable" for absent/incomplete active
fare rules or an unassigned route area. Show discount estimates only when a
valid configured rule exists; show explicit unavailable/unverified text
otherwise.

Label the table as an estimate and state that comparison variants are not a
claim that every variant serves the selected route. Display the rounded amount
while keeping the calculated amount in the calculation result. Include the
existing fare source/effective date and verification status for each estimate.

- [ ] **Step 3: Preserve rail fare behavior and error/loading states**

For matrix-model routes, keep station-pair rail fare lookup and do not compute
road-distance fares. Preserve existing route details loading, map path, stop
selection, trip clearing, and fare errors. If a valid configured discount rule
exists for a rail variant, calculate an informational discounted estimate from
each existing matrix fare; preserve the current two-decimal rail display rather
than applying road-fare whole-peso rounding.

- [ ] **Step 4: Run focused lint and production build**

Run: `npx eslint src/lib/fares.ts src/lib/routes.ts src/lib/fareCalculations.ts src/pages/registered-user/Home/Home.tsx`
Expected: no lint errors.

Run: `npm run build`
Expected: TypeScript and Vite build succeed.

### Task 5: Verify the Full Fare Comparison Flow

**Files:**
- Modify: `src/lib/fareCalculations.test.ts`
- Modify: `src/lib/fares.test.ts`
- Verify: `src/pages/registered-user/Home/Home.tsx`

**Interfaces:**
- Consumes: Fare option and calculation interfaces from Tasks 2–4.
- Produces: Regression coverage for the fare comparison contract and final
  validation evidence.

- [ ] **Step 1: Add regression cases for missing variant rules and discounts**

Verify that one missing variant fare rule does not hide other variants; missing
or unverified discount data never produces an invented discounted amount; an
unassigned route area never uses unscoped fare rules; and a configured discount
amount is rounded only for display.

- [ ] **Step 2: Run all tests, lint, and build**

Run: `npm test`
Expected: all unit tests PASS.

Run: `npm run lint`
Expected: no lint errors.

Run: `npm run build`
Expected: TypeScript and Vite build succeed.

- [ ] **Step 3: Inspect final diff and hand off the SQL**

Run: `git diff --check`
Expected: no whitespace errors. Confirm the SQL script is additive and ready for
the user to paste into Supabase SQL Editor; do not apply it to a remote project.
