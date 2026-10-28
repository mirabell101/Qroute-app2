# Shared Transit Map and Fare Metadata Removal

## Intent

Passengers should get the same map-based route discovery, trip selection, and
fare estimates on registered-user Home, admin Base, and visitor Landing.
Vehicle markers and route paths should use each transport type's configured
color consistently. Fare cards should omit source metadata that currently adds
clutter.

## Goals

- Reuse one complete map experience across all three pages: route/place search,
  route paths, transport-specific markers, route selection, boarding and
  destination selection, and fare estimates.
- Preserve each page's existing authentication, navigation, account actions,
  and overall shell.
- Make the shared map work while logged out by adding anonymous read-only
  access only to approved, active public transit records and non-deleted fare
  data.
- Keep each route's own identity, geometry, transport type, fare model, and
  configured `transport_types.color`.
- Use route colors for route paths and ordinary route-associated vehicle
  markers. Keep selected boarding and destination markers green and red,
  respectively, as confirmed by the user.
- Remove fare-source presentation and fare metadata no longer needed by the app.
- Remove only fare metadata columns from Supabase; leave route, terminal, and
  stop data and approval/moderation fields unchanged.

## Non-goals and anti-goals

- Do not alter user credentials, `profiles`, or authentication.
- Do not change route, terminal, or stop approval/moderation behavior.
- Do not expose unapproved, deleted, or banned route/stop/terminal records to
  anonymous visitors.
- Do not grant anonymous access to profiles, user records, or write operations.
- Do not delete fare rows, fare values, fare dates, fare variants, or fare
  calculation behavior.
- Do not use a fixed blue marker/path color when a route has a configured color.
- Do not duplicate the map/fare implementation across the three pages.

## Current state and constraints

- `Home.tsx` currently owns the full map flow and fare panel. `Base` and
  `Landing` each show a static map marker and have separate page shells.
- Existing shared libraries already provide route/map data, route geometry,
  fare lookup/calculation, and map icons. Build on those APIs and keep Supabase
  access through existing data modules.
- Route and marker colors come from `transport_types.color`; selected trip
  endpoints remain role-coded green/red.
- The verified public schema has `source_name`, `source_url`,
  `verification_status`, and `notes` on `fare_rules` and `rail_fares`.
  `fare_discount_rules` has `source_name`, `source_url`, and
  `verification_status`; it has no `notes` column.
- Add a forward-only migration dropping only those existing columns from
  those three fare tables. Update application types, queries, fare-card
  models, and the MRT-3 seed so they no longer refer to dropped columns.
  Preserve historical migrations rather than rewriting applied history.
- Live Supabase policies are currently authenticated-only on the route/map
  and fare tables. Logged-out access therefore requires explicit `anon`
  SELECT grants and RLS policies. Scope the public policies to approved,
  active, non-deleted, non-banned routes/stops/terminals; route-stop links
  must follow route visibility; fares and variants must be active and
  non-deleted as applicable. Use column-level grants for anonymous access so
  author IDs, moderation notes, and moderation/audit fields are not exposed;
  keep route ownership checks available only to authenticated callers. Keep
  all write grants and policies unchanged, and do not touch profile/user
  policies.
- Do not inspect or modify secret files. Supabase changes must not read or
  alter user/profile data.

## Approaches

1. **Shared map experience (chosen):** Extract the route-map and trip/fare
   experience from Home into shared map components and state logic, then embed
   it in all three page shells. This keeps the visible behavior and core
   selection/fare logic consistent while leaving authentication and navigation
   page-specific.
2. **Shared hooks with separate UIs:** Extract data/state utilities, but
   independently wire the map and fare UI in each page. This allows more
   presentation variation but increases integration effort and the risk of
   behavior drift.

The user chose the shared map experience. Home-only sign-in and route-edit
actions remain in Home's page shell; the public route and fare exploration is
shared.

## Fare metadata removal

Drop `source_name`, `source_url`, `verification_status`, and `notes` from
`fare_rules` and `rail_fares`; drop `source_name`, `source_url`, and
`verification_status` from `fare_discount_rules`. Update the migration and
seed assets used for future setup without changing historical migration
history. Keep effective date fields because fare selection depends on them.
Keep all fare amounts, discount percentages, fare rules, and rows unchanged.

## Anonymous visitor access

The user approved logged-out access to the shared transit map. Add read-only
`anon` access for the data required by route discovery and fare calculation:
transport types/active variants, approved public routes, approved public stops
and terminals, visible route-stop relationships, fare areas, non-deleted fare
rules and distance bands, non-deleted discount rules, and non-deleted rail
fares. RLS must prevent unapproved, deleted, or banned transit submissions
from becoming public and must not expose user/profile data, author IDs,
moderation notes, or moderation/audit fields. Use column-level anonymous
grants. Authenticated route-owner checks remain available only to authenticated
callers. Do not broaden authenticated write access or alter moderation
behavior.

## Builder decisions

- Choose the smallest shared component/hook boundary that lets the three pages
  use the same search, route display, trip selection, and fare UI without
  moving account-specific actions into the shared map.
- Preserve existing route rendering, overlapping-route selection, bidirectional
  boarding/destination behavior, fare validation, and explicit error/loading
  states.
- Ensure multiple transport types serving one physical point remain separately
  identifiable, with each ordinary marker using its associated route color.
- Apply and verify the forward-only Supabase migration against the connected
  QROUTE project only after implementation is approved; verify only the target
  fare-table schema and public transit policy definitions and do not query or
  change user/profile data.

## Success checks

- All three pages expose the same route/place search, route paths, selectable
  stops, bidirectional boarding/destination flow, and Regular/Student/PWD fare
  estimates.
- Vehicle markers and route lines match the configured route color; selected
  endpoints retain their distinct green/red role colors.
- Fare cards contain no source names, URLs, notes, or verification labels.
- Supabase retains all fare rows, fare amounts, and effective dates, while only
  the specified fare metadata columns are absent.
- Logged-out clients can read only the approved public transit/fare data needed
  by the map, with no author/moderation metadata, profile reads, or anonymous
  writes.
- Existing authentication, route approval/moderation, and unrelated page
  navigation remain unchanged.
- Tests, lint, and production build pass; diff checks are clean.
