# Route Selection and Fare Comparison

## Intent

Make route discovery more direct on the Home map: users browse clickable route
choices instead of using the compact route dropdown, then see the selected
route, its stops, and trip details. Compare fares across variants grouped under
the selected route's transport type and show regular and eligible-discount
estimates without implying every variant operates on the selected route.

## Goals

- Replace the route dropdown with a clickable route list that stays visible
  alongside selected-route details.
- Keep the selected route's map line and stops, boarding/destination choices,
  route distance, and existing trip workflow.
- For a selected route and trip distance, compare the variants belonging to its
  transport type using each variant's active, location-appropriate fare rules.
- Display regular fare estimates and estimates after configured passenger
  discounts for eligible students, senior citizens, and PWDs.
- Round displayed road-transport estimates to the nearest whole peso, while
  preserving the unrounded calculation separately.
- Keep rail estimates based on the existing station-to-station fare matrix.

## Non-goals

- Do not collect passenger identity or require users to select an eligibility
  category; discounts are informational comparisons only.
- Do not claim that every variant operates on the selected route.
- Do not hardcode variant surcharges, fare rates, discount percentages, or
  official-source claims in the frontend.
- Do not alter route ownership, moderation, or route geometry.

## Approaches

1. **Compare active rules for variants of the selected transport type (selected).**
   Calculate each variant against the selected trip segment, retain unrounded
   values separately from whole-peso display estimates, and apply configured,
   effective discount rules for informational eligible-passenger estimates.
   This reflects rule differences without inventing route coverage or surcharges.
2. **Apply fixed differences between variants.** Simpler, but cannot represent
   different rate bands, independent fare sources, or discounts reliably.
3. **Create shared route records for each variant.** Would assert route coverage
   and requires route schema/data changes; not needed for fare comparisons.

## Decisions

- Keep route choices visible beside selected-route details.
- Load applicable transport variants and active fare/discount rules based on the
  selected route's transport type, not only its default variant.
- Calculate regular estimates and configured discount estimates for the selected
  trip segment. Do not collect passenger-category information.
- Show "Fare unavailable" when a variant has no active applicable fare rule.
  Show discount unavailable/unverified states when no valid configured discount
  rule exists or its verification status is not verified.
- Label comparisons as estimates and not confirmation of route availability for
  each variant.
- Round displayed road-transport estimates to the nearest whole peso while
  retaining original calculated precision internally. Keep rail fare matrix
  lookups.

## Constraints and implementation notes

- Routes are currently tied to a single `transport_variants` row. Fare rules are
  keyed by variant, so comparison must query all active variants and their
  effective rules for the selected route's transport type.
- The route list must preserve existing route filtering/visibility behavior.
- The current `fare_rules` schema supports one base distance and one flat
  per-kilometer rate and has no passenger discount records. It cannot represent
  tiered succeeding-distance rates or configured discount percentages, dates,
  and sources. It also has no route service area or fare-rule location. Necessary
  database extensions are in scope: represent fare areas linked to routes and
  fare rules, multiple distance-rate bands per fare rule, and effective, sourced
  discount rules.
- Passenger discounts should be configured in Supabase (including the standard
  20% where supported), rather than hardcoded in the frontend. The frontend must
  indicate unavailable or unverified discount rules.
- Use only active fare rules whose fare area matches the selected route's area.
  Do not silently use unscoped or differently scoped rules; routes or rules
  without an area must produce an unavailable estimate until configured.
- Existing railway fares remain station-pair matrix based; configured applicable
  discounts may be displayed as estimates without changing the matrix lookup.
- Preserve fare source attribution, effective dates, route/stop selection,
  filtering, and map rendering. Avoid unrelated schema or product changes.
