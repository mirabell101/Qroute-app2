# MRT-3 Seed Empty-State Compatibility

## Intent

Update the reviewable MRT-3 seed script to work after the user has manually removed the demo transit rows, without weakening its safeguards against deleting unexpected data. The script remains a SQL-only deliverable and must not be executed against Supabase by this work.

## Goals and constraints

- Accept either the exact original demo transit dataset or a completely empty set of routes, route-stop links, stops, and terminals.
- Abort before writes for partial or otherwise unexpected transit data.
- Preserve the existing MRT-3 stations, route, fare values, discount metadata, and source notes.
- Do not read secrets or `.env` files; Supabase inspection is read-only.
- Do not merge, commit, push, or otherwise alter Git state.

## Approaches

1. **Accept either the known demo dataset or a fully empty transit dataset (recommended).** Keep the existing guarded reset path and allow the observed manually-cleared state. This preserves the script's original purpose while supporting the current database state.
2. **Require a fully empty transit dataset only.** Simpler for the current database, but removes the previously supported guarded demo-reset path.

The user selected approach 1.

## Implementation

Refactor the precondition checks so the script classifies the current transit rows as either the exact known demo set or fully empty. In both cases, validate that no unrelated route-stop or transit rows exist. Keep deletion constrained to the named demo rows and the resolved demo route; those deletes are harmless when the accepted state is empty. Continue to reject existing rail fares, rail-variant discounts, or linked map images as before. Seed data and fare calculations remain unchanged.

## Verification

Review the SQL precondition logic and run static checks for both accepted states, rejection of partial states, safe delete scope, and unchanged seed contents. Do not run the SQL against Supabase.
