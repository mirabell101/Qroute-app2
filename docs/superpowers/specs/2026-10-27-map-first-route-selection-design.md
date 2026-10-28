# Map-First Route Selection and Fare Display

## Intent

Make the map the primary way to discover routes, terminals, and stops. A user
should be able to open a contextual place panel, see which routes serve that
place, select a route, and view its complete path and stops without using the
old route list panel. Route fare information stays on the map page and uses the
existing fare rules and calculations.

## Goals

- Remove the standalone Routes list from the Home map.
- Show searchable routes and selectable terminal/stop markers on the map.
- Clicking a terminal or stop opens a place-information panel and lists its
  associated routes; the user can choose a route when there are multiple.
- Selecting a route from a place or search result shows the complete routed
  path, all visible route stops/terminals, and the selected-route styling.
- Keep fare information in the contextual route panel and calculate segment
  estimates from the selected route's fare rules.
- Let map clicks select trip endpoints: the first applicable stop/terminal is
  the boarding point and a later point is the destination. Do not require
  separate “Board here” / “Get off here” buttons.
- Reuse the current Supabase, route detail, OSRM, rail, and fare logic wherever
  possible.

## Non-goals

- Do not connect a new geocoding/search provider; search is limited to loaded
  routes, stops, and terminals.
- Do not display every route's road geometry on initial map load.
- Do not change fare formulas, discount rules, fare areas, or route moderation
  policy.
- Do not modify Supabase data, migrations, or the user's database reset/seed
  request as part of this map change.
- Do not change navigation, authentication, photos, or unrelated Home features.

## Current behavior and constraints

- `Home.tsx` loads active terminals separately and loads active route names into
  a left-side route selector. Its search input is currently a placeholder.
- Stop markers appear only after a route is selected. Terminals appear at all
  times, but currently have no route choices when clicked unless they are on the
  selected route.
- `getRouteDetails` loads a route's ordered stops and terminals. The Home page
  draws a road-following OSRM line for road routes and station connectors for
  rail routes; the selected line is framed in the map.
- Fare rules are loaded when a route is selected. Fare amounts require a
  selected boarding stop and a later destination stop. Existing logic supports
  road fare variants, rail matrix fares, discounts, and unavailable states.
- Route discovery and point visibility must respect the same active, not
  deleted, and not banned route filters as the existing selector, plus the
  existing row-level visibility of nested stops and terminals.

## Approaches considered

1. **Map markers plus local search (chosen):** show the available stop and
   terminal markers, make the search box find routes and places, and load/draw
   full route geometry only after a route is selected. A place lists associated
   routes. This minimizes map clutter and avoids routing every route up front.
2. **Draw all route lines and stops initially:** allows direct selection from
   any visible line, but creates visual clutter and would require loading or
   calculating many route geometries. This does not fit the map's primary
   readability goal.

The user chose approach 1 and the place-panel interaction: a clicked terminal
or stop shows details and associated routes, then selecting a route draws that
route and all its stops.

## Interaction design

### Map discovery and search

- Keep the map full-screen and remove the old Routes list card.
- Populate clickable markers for active terminals and visible stops associated
  with eligible routes. Deduplicate a place used by multiple routes, while
  retaining its route associations.
- Turn the existing search input into local search over route names, stop
  names, and terminal names. Results identify their kind and route/transport
  context.
- Selecting a route result selects that route and displays its complete path.
  Selecting a terminal or stop result opens that place's contextual panel and
  presents the routes serving it.
- Selecting a map marker uses the same place-panel behavior as a place search
  result.

### Place and route panels

- Use one compact, map-overlay contextual panel in the Google Maps style.
- A place panel shows the clicked terminal/stop name, type, coordinates, and
  available description/photo information, plus routes serving that place.
- When a route is already selected, clicking a place keeps its route, trip
  endpoints, and fare information active. Show the clicked place details and
  route choices together with the selected route's details/fare section in the
  same panel.
- Selecting a different route from the place panel replaces the active route
  and resets the trip endpoints, as route changes do today.
- A route panel shows route/vehicle identity, all ordered stops, route status,
  route distance/time when available, and the existing fare comparison
  information. Preserve fare-source, verification, discount, and unavailable
  states.
- Keep fare information visible whenever a route is selected. Before both trip
  endpoints are selected, explain that the user should choose a boarding point
  and a later destination; after selection, show the calculated estimates.
- The first click on an eligible point along the selected route chooses the
  boarding point; a click on a later point chooses the destination and updates
  fares. If a place click is what led to a route selection, that place becomes
  the boarding point once the serving route is selected. If a route is chosen
  directly from search, the user selects its boarding point on the map first.
- Keep endpoint selection constrained to the selected route's order. Preserve
  the existing clear-trip and invalid-distance/unavailable handling, but do
  not require separate “Board here” / “Get off here” actions.
- The route remains highlighted and its complete path/stops remain on the map
  when the contextual panel switches to a clicked place.

### Route geometry and map behavior

- Continue to use the current route detail loader and route geometry effect.
- Selecting a new route resets the previous trip selection and loads its
  complete route path as today. Selecting a route from a clicked place sets
  that place as the initial boarding point.
- Clicking route markers follows the endpoint sequence above while also
  showing place details and route associations. Opening another place does not
  clear an already selected route or its endpoint pair.
- Keep the existing route color/highlight, selected-stop markers, map framing,
  current-location behavior, OSRM error handling, and rail representation.
- Do not call OSRM for all routes at startup; only the selected route is routed.

## Data and implementation notes

- Add or adapt a route-map index query in the route data layer that returns
  eligible route names/types and their visible ordered point associations.
- Build a deduplicated map-point index keyed by point kind and database ID;
  include the routes associated with each point so a marker can open its route
  choices without extra per-marker queries.
- Continue loading full selected-route details through `getRouteDetails`.
- Keep derived search results and marker associations client-side; report
  loading and query failures explicitly rather than hiding them.
- Adapt the existing Home selector/details layout into the contextual panel
  rather than adding a second parallel route or fare system.

## Acceptance criteria

1. The old route-list panel is absent, and the map remains the main interface.
2. Active eligible routes, terminals, and visible route stops can be found by
   local search; markers for shared points are not duplicated.
3. Clicking or searching a terminal/stop opens a place panel with its details
   and associated routes. Selecting a route displays its whole path and stops.
4. Searching/selecting a route directly has the same result as selecting it
   from a place panel.
5. The selected route is visually distinct, framed on the map, and retains all
   route stops even when a place is opened.
6. Route fare information is available in the route panel immediately; valid
   boarding/destination stop selections calculate fare estimates using the
   existing rules, and invalid or unavailable estimates remain clear.
7. Road routes continue to use OSRM geometry, rail routes keep existing station
   handling, and request failures remain visible.
8. No Supabase data or schema is changed as part of the map implementation.

## Testing

- Add focused route-index tests for point deduplication and route associations.
- Add focused search-result tests for route, terminal, and stop matches and
  selection targets.
- Run existing route and fare tests, focused ESLint, and production build.
- Manually verify desktop and narrow viewport map interactions if a browser is
  available; database integration is not required for local unit tests.

## Open decisions left to the builder

- Exact breakpoints and compact-panel sizing should follow the current Home
  styling conventions.
- The builder may choose the simplest typed helper shape for route-index and
  search results, provided the required behavior and tests are preserved.
