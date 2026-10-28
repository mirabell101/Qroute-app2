# Map Route Discovery and Fare Selection Design

## Intent

Passengers should be able to explore route choices directly from the map, then estimate a fare only after choosing a valid boarding point and destination. Clicking a stop or terminal should reveal its details and all routes that serve it without requiring an extra action just to see those routes.

## Goals

- On a place click or place search, immediately show its details and request/display the complete path and stops for every route associated with that place.
- Keep each route keyed by its database route ID, transport type, ordered stops, geometry, and fare rules; shared coordinates must never combine routes.
- Make jeepney and bus stops visually distinguishable and give routes serving the same place separate, accessible choices.
- Allow any stop or terminal in the selected route sequence to be a boarding point. Require a later stop in that route sequence as the destination.
- Keep route visualization independent of trip/fare selection. Do not show fare amounts before both endpoints are valid.
- Show Regular, Student, and PWD fare results as compact icon-led cards, not a table, reusing current fare calculation, discount, source, and rail matrix behavior.
- Preserve the existing map, local search, route/fare data rules, navigation, and authentication.

## Non-goals

- No geocoder or new mapping/routing provider.
- No Supabase reset, seed, schema migration, or remote database changes.
- No fare formula, fare-area, discount-policy, or route-visibility changes.
- No route-wide geometry requests on initial page load; geometry loads only for the routes associated with a place the user opens, or for a route directly selected through search.

## Current behavior and constraints

- `getRouteMapIndex` loads active routes and visible nested point associations, and `mergeMapTerminals` keeps active unassociated terminals discoverable.
- Home currently has one marker per physical `kind/ref_id`; its place panel lists serving routes, but only one selected route gets an OSRM road line.
- `getRouteDetails` supplies the selected route's ordered stops, transport variant, and fare area. Road routes currently use OSRM; rail routes use station coordinates and matrix fares.
- Road fare comparisons use `calculateFareOptionEstimates`; applicable discounts and source details come from `fares.ts`. Rail fare is looked up for the selected station pair.
- Route IDs and `transport_type_id` are the stable identities. Coordinates are for rendering and distance, never route identity.

## Approaches

1. **Lazy full-road geometry for every serving route (selected):** On opening a place, load full route details and request OSRM geometry for each associated road route, using session-level in-flight/result caching by route ID. Use ordered station geometry for matrix/rail routes. This meets the requested immediate full-path behavior and avoids fetching geometry for unrelated routes, at the cost of several OSRM requests when many routes share a place.
2. **Connect ordered stops first, load road geometry for one route on selection:** Fast and low-request, but the initial paths are not road-following. Rejected because the user explicitly chose full road paths for all serving routes on place click.

## Interaction and state

- **Place exploration:** A marker click or place search opens the combined contextual panel, focuses the map, and starts loading each serving route's visualization. Each route is identified by its name and transport type. A place with multiple routes keeps those route choices separate.
- **Visualization vs. trip selection:** Route paths may be visible for multiple routes at once. One route ID is the fare-active route. Selecting a route from a place seeds its clicked point as boarding only when that point is in the route's ordered stops. Selecting a route from route search has no implicit boarding point. Selecting a different route clears the old boarding/destination and fare state.
- **Stops:** Once a route is active, clicking one of its points sets boarding if none exists; clicking a later point sets or updates destination. Clicking a point at or before boarding after a complete pair starts a new trip from that point and clears the previous destination. A clicked point outside the active route never feeds fare calculations; the panel explains this and offers its compatible routes.
- **Fares:** Hide fare amounts and fare cards until a valid boarding/destination pair exists. Reject same-point or reverse-order pairs. For distance routes, calculate with the existing route-segment distance and configured transport-type fare rules. For matrix routes, use the existing route/station fare lookup. Present Regular, Student, and PWD as separate icon-led cards. If existing fare options have multiple vehicle variants, show the available variants within each passenger card rather than silently choosing or dropping variants. Show unavailable/missing-rule states instead of a fabricated amount. Preserve fare source and verification details in the compact presentation.
- **Shared physical markers:** Keep one canonical point identity and its real coordinates for interactions, route geometry, and fare calculations. Where both bus and jeepney serve the same physical stop, show distinct, selectable transport-type marker affordances with display-only visual offsets; each opens the same point details and route choices. Do not duplicate route associations or route stop sequences.
- **Route path appearance:** Preserve independent route geometries keyed by route ID. Use each transport type's configured color and distinct line patterns; emphasize the fare-active route. Route markers are derived from each route's own stop sequence and use transport-type-specific icons. Marker display offsets must not change stored coordinates, route distance, or fare distance.
- **Async behavior and failures:** Only display geometry under the matching route ID; stale requests must not replace newer route/place selections. Cache route detail/geometry promises or results during the Home session to avoid duplicate requests when changing places. A route geometry failure is displayed for that route while other associated routes remain available. Existing query and fare errors remain visible; no error is converted into a successful-looking fare.

## Implementation boundaries

- Expected main changes are in Home's map state, route geometry loading/rendering, endpoint selection, and fare presentation, plus map icon support and tests for route identity, geometry loading, and trip state where helpers can be isolated.
- Reuse existing `getRouteMapIndex`, `getRouteDetails`, `getMapIcon`, OSRM integration, and fare APIs/calculations. Do not add a dependency or call Supabase outside established route/fare helpers.
- Any changes remain on the existing `backend-using-des` branch and preserve its current uncommitted fare/map work.
- The caller requested no `.env` or other sensitive configuration reads and no remote database access; continue to honor that restriction.

## Acceptance checks

- Clicking or searching a place immediately opens details and loads every serving route's full visualization; multiple routes remain separately selectable.
- Jeepney and bus stop affordances are distinguishable at shared and distinct locations, without changing actual route coordinates.
- Choosing a route from the place uses that place as boarding if valid; route search alone creates no fare state.
- A valid later point creates/updates destination and produces Regular, Student, and PWD estimates with existing rules. Invalid or unrelated points cannot produce stale or unrelated fares.
- Fare presentation contains no HTML table and uses three separate icon-led category cards.
- Existing navigation/auth, rail and road fare logic, moderation visibility, and no-geocoder behavior remain intact.
- Unit tests, focused lint, full build, and the full project test suite pass. Browser interactions are exercised if a compatible browser is available.
