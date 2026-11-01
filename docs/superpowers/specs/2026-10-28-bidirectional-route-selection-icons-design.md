# Bidirectional Route Selection and Vehicle Endpoint Icons

## Intent

Let passengers choose a boarding point and a different destination anywhere along the selected route, regardless of the stored stop order. Replace the generic “A” and “B” endpoint marker letters with icons representing the selected route’s train, bus, or jeepney type.

## Goals and non-goals

- The first selected route stop is boarding; a different stop becomes or updates the destination whether earlier or later in route order.
- Calculate road-route distance from the absolute difference between the two cumulative route distances; rail continues to use its existing symmetric station-pair fare lookup.
- Show the vehicle-type glyph in both endpoint markers, retaining green boarding and red destination colors.
- Keep existing route stop ordering, route geometry, map interactions, and non-endpoint markers unchanged.
- Do not change fare formulas, fare data, map search, or database state.

## Approaches

1. **Vehicle glyph inside green/red endpoint markers (chosen).** Reuse the existing Leaflet icon helper and route transport-type data to render a train, bus, or jeepney glyph directly in each endpoint marker. This clearly communicates both route mode and endpoint role without adding map UI.
2. **Generic endpoints plus a separate mode badge/legend.** This avoids changing endpoint icon rendering, but requires passengers to cross-reference another map element and adds clutter.

The user selected approach 1 and confirmed bidirectional selection.

## Implementation notes

- Update trip selection so only selecting the current boarding index resets the destination; any other valid route-stop index sets the destination.
- Permit fare display when both endpoint indices are valid and distinct, not only when the destination index is greater.
- Use the absolute cumulative-distance difference for road routes. Keep rail station fare lookup unchanged.
- Select the endpoint glyph from the chosen route's transport type and apply green/red endpoint colors. Preserve accessible marker titles/alt text.
- Add unit tests for reverse-direction selection and absolute route-distance behavior where the existing helper structure supports it.

## Constraints

- Reuse existing React, Leaflet, Lucide icons, route geometry, and fare calculation logic; add no dependencies.
- Keep route IDs, stop sequence, actual coordinates, and fare rules unchanged.
- Preserve existing behavior for selecting the current boarding point again, which clears the trip.
