# Direct Map Route Selection

## Intent

Passengers should interact with stops, terminals, and route paths directly on the map rather than choosing a route from a list in the place-details panel. They can start at any valid stop or terminal served by the selected route; terminals are not mandatory.

## Goals

- Remove the “Routes serving this place” route-button list from place details.
- Clicking a stop or terminal still opens its location details and displays every serving route path.
- If a clicked point serves exactly one route, activate that route and use the point as the boarding stop when no trip is active.
- If paths overlap or a point serves multiple routes, keep each route distinct and allow route selection by clicking its visible line.
- Selecting a different route clears the previous trip endpoints and fare state; selecting a route line does not assume a destination or show a fare.
- Keep transport type, route ID, ordered stops, real coordinates, and existing fare rules authoritative.

## Non-goals

- No schema, Supabase, route data, geometry provider, fare formula, or authentication changes.
- No invented stop or route data.
- No reintroduction of a route list in another form.

## Approaches

1. **Clickable route lines, with automatic selection for unambiguous stops (chosen).** A unique-route point activates its route and boards there. For shared stops, the passenger can distinguish and select the already-visible route paths on the map. This removes the panel step while preserving separate route identities.
2. **Always auto-select one route at a point.** This avoids another interaction, but silently chooses between bus/jeepney or other shared routes and can assign the passenger to the wrong service.
3. **Keep a route picker in the details panel.** This preserves the current reliable route selection but retains the extra “little tab” interaction the user wants removed.

## Interaction details

- A route-line click activates that exact route by route ID, clears any incompatible boarding/destination and fare, and shows its ordered stops; it does not create a fare estimate.
- When multiple routes have exactly coincident route geometry, repeated clicks on the visible line cycle through those route IDs so an obscured path remains selectable.
- A point click continues to show place details and serving route geometry. If there is a single serving route and no active trip, the point also becomes boarding for that route. If a route is already active and the point belongs to it, normal boarding/destination selection applies.
- If a point serves multiple routes and no route is active, do not choose a route implicitly; retain all paths and let the passenger click the intended path. If a clicked point is outside the active route, it must not change endpoints or fares.
- Clicking a terminal follows the same rules as clicking any other valid route stop.
- Because lines can overlap, retain route-specific colors and dash patterns and keep route lines independently clickable where the map renderer permits.

## Constraints and builder decisions

- Build on the existing Leaflet polylines, marker handlers, route-layer cache, and endpoint transition helper.
- Use the current route ID and point kind/ID association rather than coordinates to establish membership.
- A route-line click target may need a wider, transparent interactive polyline beneath its visible stroke; any such hit area is display-only and must not affect route geometry.
- Route geometry identity for line cycling is display-only, direction-independent, and must not modify coordinates used for fares or route stop membership.
