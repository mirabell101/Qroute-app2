# Fare Management CSV Import

## Intent

Give administrators a controlled way to upload a distance-fare CSV, preview
its validity, and publish it as a new effective-dated fare version. Existing
fare history remains intact. The imported data becomes the source used by the
route-fare calculator.

## Scope

- Add an Admin-only Fare Management page and navigation entry.
- Accept one UTF-8 `.csv` file up to the existing 1 MB JSON request limit.
- Require the columns `distance_km`, `regular`, `student`,
  `senior_citizen`, and `pwd` (case-insensitive; whitespace ignored).
- Require positive, strictly increasing whole-kilometre distances; finite,
  non-negative currency values; and no duplicate rows.
- Let an administrator choose a distance-based transport variant, optional
  existing fare area, and an effective-from date.
- Provide a manual rule editor for base fare, base distance, rounding step,
  and contiguous per-kilometre bands. CSV import fills this editor; admins
  can then adjust the derived values before publication.
- Preview rows and derived base fare, base distance, distance bands, and
  20% discounts before publication.
- Re-validate the raw CSV on the server, or validate a manual rule payload,
  write a new `fare_rules` row and its `fare_rule_distance_bands`, and write
  an admin audit record.
- Update the shared fare calculation to honor each rule's `rounding_step`,
  including discounts, so quarter-peso guide values display faithfully.

## Non-goals

- No schema, RLS, role, or remote database changes.
- No rail/station-to-station matrix imports.
- No overwrite or deletion of historical fare rules.
- No automatic creation of fare areas or discount rules.
- No third-party CSV dependency.

## Chosen approach

Use the present formula-and-band model. The supplied PUJ guide maps to a
four-kilometre base fare of PHP 14.00, followed by one PHP 2.00/km open-ended
band, with PHP 0.25 rounding. Its special-fare column is validated as the
existing 20% discount, rounded to the same step. Manual editing is the same
editor without a CSV: an administrator adds, removes, or adjusts contiguous
bands before publishing a new effective-dated version.

The page will reject a CSV whose special-fare values do not match active
20%-discount rules for all three categories, or whose regular fares cannot be
represented by contiguous rate bands. That prevents a successful import from
silently changing the quoted guide. A future exact-row matrix feature would
need a separate table and migration.

## Backend design

1. Add a focused fare-import service with pure CSV parsing/derivation helpers
   and a transactional RPC-free sequence through the authenticated,
   request-scoped Supabase client.
2. Add `GET /api/admin/fares` for distance variants, fare areas, active rules,
   bands, and discount rules; add `POST /api/admin/fares` with a discriminated
   manual or CSV payload.
3. Keep `requireAuth` and `requireAdmin` on both endpoints. Use the verified
   access token client so existing moderator RLS permissions apply; do not use
   the service-role client for fare writes.
4. Reject conflicts before writes: duplicate `(variant, area, effective_from)`
   rule, non-distance variant, missing area, invalid effective date,
   non-contiguous/invalid bands, oversized input, and malformed CSV. CSV
   imports additionally reject inactive or unavailable 20% discounts and a
   guide that cannot reproduce every supplied row at the selected rounding
   step. Manual publication may use any safe non-negative rule/band values.
5. Insert the rule and its bands only after full validation. If a later band
   insert fails, compensate by soft-deleting the just-created rule and report
   a generic error. Record the successful import through the existing audit
   logger.

## Frontend design

1. Add `/admin/fares`, protected by the existing Admin guard, and a Fare
   Management item to existing admin navigation.
2. Reuse the dashboard's layout language: sidebar, account header, loading,
   inline error, empty, preview, and completion states.
3. Read the local CSV with `File.text()`, perform an early preview, and fill
   the manual editor; submit either raw CSV plus target or the explicit manual
   rule through `adminApi`. The backend is authoritative.
4. Disable publication until a file, variant, effective date, and successful
   preview are present. Show exactly which CSV row or target setting failed.

## Verification

- Unit-test parsing, header validation, rate-band derivation, quarter-peso
  rounding, special-fare validation, and rejection cases.
- Add route tests proving anonymous and non-admin callers cannot access import
  endpoints, invalid payloads cause no writes, and a valid import uses the
  verified request token.
- Add API-client tests for authenticated load/import handling.
- Run focused tests, the community test suite, lint, and production build.
