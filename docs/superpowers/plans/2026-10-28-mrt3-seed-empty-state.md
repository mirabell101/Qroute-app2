# MRT-3 Seed Empty-State Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Allow the reviewable MRT-3 seed SQL to start from either the exact original demo transit dataset or a completely empty transit dataset, while rejecting partial or unexpected data.

**Architecture:** Change only the SQL precondition guard in the existing seed script. Classify the transit tables as one of two accepted states before any writes; preserve the current scoped deletes, remaining safety checks, and seed contents.

**Tech Stack:** Supabase PostgreSQL SQL.

**Spec:** `docs/superpowers/specs/2026-10-28-mrt3-seed-empty-state-design.md`

## Global Constraints

- Do not read `.env` or other sensitive files.
- Inspect Supabase only with read-only queries; do not execute the seed or other data-changing SQL.
- Accept only the exact original demo data or a fully empty set of routes, route-stop links, stops, and terminals.
- Do not alter the MRT-3 station, route, fare, discount, or provenance data.
- Do not perform Git operations, commit, merge, or push.

## Review Focus

- An entirely empty transit dataset must pass the new precondition.
- The exact original demo-only dataset must continue to pass.
- Any partial or unexpected transit rows must fail before writes.
- Empty-state execution must leave scoped deletes harmless and must not broaden deletion scope.
- Existing rail-fare, rail-discount, and linked-map-image guards must remain effective.

---

### Task 1: Accept the cleared transit state safely

**Files:**
- Modify: `supabase/seeds/reset_and_seed_qc_mrt3.sql`

**Interfaces:**
- The seed script remains a one-time transaction; its guard accepts either the exact existing demo state or zero rows in `routes`, `route_stops`, `stops`, and `terminals`.

- [ ] **Step 1: Add explicit precondition classification**

  In the `DO` block, compute whether the database is completely empty across the four transit tables and whether it matches the exact expected demo dataset. Raise the existing clear exception unless one of those conditions is true. Keep all checks before the first `DELETE`.

- [ ] **Step 2: Preserve safe reset behavior**

  Keep the existing named demo-route/stop/terminal deletes and route-ID scoping. In the empty state, the demo route lookup may produce `NULL`; ensure its dependent deletes remain no-ops and do not widen them to unscoped deletes.

- [ ] **Step 3: Review unchanged safety checks and seed data**

  Confirm the rail-fare, rail-variant discount, and linked map-image preconditions remain before any delete. Confirm station rows, route moderation fields, six fare pairs, and Student/PWD discount inserts are unchanged.

- [ ] **Step 4: Validate both allowed states and rejection behavior**

  Inspect the guard logic against these cases:
  - Empty: zero rows in all four transit tables; accepted.
  - Original demo: exact route identity/status, five expected ordered links, three named stops, two named terminals, and no additional rows; accepted.
  - Partial or unexpected: any other combination; raises before writes.

  Run `git diff --check` only if permitted; the user requested no Git operations, so prefer a direct whitespace check of the edited SQL file without invoking Git.

  Do not execute SQL against Supabase.
