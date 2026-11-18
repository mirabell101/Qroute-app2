# QRoute Admin Operational Design

## Intent

Make the existing QRoute Admin area operational and data-backed for administrators. Admins should be able to manage accounts, routes, community posts, and submitted reports while the existing visual language and page layouts remain recognizable.

The user explicitly changed the earlier strict-freeze decision: matching controls may be added in-place where needed, but a visual redesign is not authorized. The user chose secure, end-to-end implementation slices and specified that reports should be submitted for community posts and transit routes.

## Goals

- Replace unavailable/placeholder Admin actions and metrics with real Supabase-backed operations.
- Protect every `/api/admin/*` endpoint with `requireAuth` followed by `requireAdmin`; derive authority from `user_roles`, never request data.
- Keep privileged Auth operations and any service-role database operations server-side, behind the admin authorization boundary.
- Add matching in-place controls to the existing Admin pages and existing community/map report surfaces, preserving their visual style and overall layout.
- Use additive, data-preserving timestamped migrations for post visibility and report storage, with RLS enabled and policies limited to reporters and moderators/admins.
- Keep multi-row route creation/update atomic and deletion non-destructive.
- Verify API authorization, input validation, mutation behavior, RLS policy intent, UI data parsing, and the requested TypeScript, unit/integration, and build gates.

## Non-goals

- Changing Google OAuth, password authentication, or the established sign-in flow.
- Replacing React, Express, Supabase, or the existing admin navigation/page architecture.
- Redesigning Admin pages or changing their visual identity.
- Applying migrations to a hosted/production Supabase project.
- Hard-deleting routes, posts, or reports as part of routine moderation.
- Creating speculative system Settings behavior where the repository has no settings model or requirements.

## Anti-goals

- Do not trust frontend roles, reporter IDs, moderation actor IDs, or claimed admin identity.
- Do not expose Supabase secret/service-role credentials to browser code.
- Do not weaken existing RLS or broaden public read access to hidden posts or private reports.
- Do not create partially written routes when the route and ordered stops are saved together.
- Do not present placeholder success or fabricate rows/counts when requests fail.

## Current State and Relevant Boundaries

- Admin pages are routed from `src/App.tsx`; `/api/admin/*` is mounted from `server/index.ts`.
- `server/routes/adminRoutes.ts` already applies `router.use(requireAuth, requireAdmin)` and supports summary, route, and registered-user reads.
- `server/middleware/requireAdmin.ts` verifies the current actor's `admin` role through `user_roles`.
- `server/supabaseClient.ts` has separate request-scoped and privileged server clients. The latter must remain server-only.
- Dashboard registered-user/route/post totals, route details, user search/details, and post listing exist. The Admin UI has no account-role/suspension controls, route form or CRUD controls, post moderation controls, or reports table.
- `community_posts` is checked in with RLS and is publicly readable; its schema has no moderation state. Anonymous Community reads use `get_public_community_data`, which is a `SECURITY DEFINER` function and therefore needs an explicit visibility filter if hidden posts are introduced.
- User community reads also use `/api/community/posts`; both this route and the public RPC must omit non-published posts. Existing posts must stay published by default when the new state is added.
- Transit pages use routes with ordered `route_stops` and either a terminal or a stop at each entry. Code and seed data use `routes.variant_id`, `route_stops.stop_order`, `route_stops.terminal_id`, and `route_stops.stop_id`; the base transit-table DDL is not checked into the repository.
- Admin role reads currently include accounts with `registered_user`; the application understands only `registered_user` and `admin`. Account role changes must preserve the application's multi-role behavior and guard against self-lockout and removing the final administrator.
- No report table, report API, or report submission action is checked in.
- Supabase migrations are imperative; there is no checked-in declarative `supabase/schemas/` tree or `config.toml`.

## Approaches

1. **Secure end-to-end slices (selected by the user).** Implement server-protected Admin APIs and corresponding in-place controls. Use the existing Supabase/Auth architecture, database migrations, and transaction-safe route operations. Add report submission to existing community-post and transit-route surfaces. This satisfies the operational goal while retaining the current page identity.
2. **Direct browser-to-Supabase mutations.** Rejected because Auth administration and privileged role changes belong on the server, and the user specifically requires a server authorization boundary.
3. **Separate Admin framework.** Rejected as unnecessary architecture that would duplicate existing pages, API utilities, and navigation.

## Design

### Admin API and authorization

- Preserve the router-level order `requireAuth` then `requireAdmin` for every Admin read and mutation.
- Use the verified request actor ID from `res.locals.user` for audit fields and self/final-admin guards.
- Validate all path parameters, enums, IDs, strings, and route-stop sequences at the API boundary. Do not accept client-supplied authorization or actor identity.
- Use the privileged client only in server code after the router-level guards, for Supabase Auth Admin operations and transaction-safe Admin writes. Keep errors generic in API responses and log database details only server-side.

### Dashboard

- Keep all current summary cards and wire the Reports card to a live report total (with pending count where the current card copy supports it).
- Continue loading registered users, routes, and posts from their actual data sources. Surface loading, error, and retry states using current page patterns.

### User management

- Return real Auth accounts with recognized `user_roles` role(s), profile username, creation time, and ban state. Keep search and add role/status filters in the existing filter/table areas.
- Permit only the existing `registered_user` and `admin` roles. Preserve multi-role rows when changing one role; prevent self-demotion and removal/demotion of the last administrator.
- Add suspend/reactivate operations through server-side Supabase Auth Admin methods. A suspension blocks new sign-ins and is reversible by an administrator. Revoke refreshable sessions as supported by Auth; report any remaining access-token expiry window honestly rather than changing the established global auth flow.
- Keep account details and success/error/loading feedback in existing table/modal patterns.

### Route management

- Load routes plus their current ordered terminal/stop sequence, transport types, variants, and fare-area metadata. Load selectable existing terminals/stops and active transport variants from Supabase; do not make route creation silently create unreviewed transit points.
- Add an in-place route form for add/edit with route name, active variant, fare area when supported, and an ordered list of at least two existing points (terminal or stop).
- Save the route and its ordered `route_stops` in one database transaction. Validate that the selected variant belongs to the selected transport type and that stop references are valid and mutually exclusive.
- Implement delete as a soft delete (`is_deleted` / the existing removal mechanism), preserving fare references, bookmarks, reports, and history. No cascade/hard delete.
- Before enabling writes, confirm the deployed/base route schema and foreign keys against the project’s actual database definition or a user-provided schema export. The checked-in code and seed reveal column usage but not all constraints; do not guess at destructive or incompatible writes.

### Community post management

- Add a persistent, constrained visibility state to `community_posts`: `published`, `hidden`, or `deleted`, defaulting existing and new posts to `published`.
- Admin listing includes every visibility state. Hide/unpublish maps to `hidden`; restore maps to `published`; delete maps to soft `deleted`.
- Filter out non-published posts in signed-in Community API reads, anonymous `get_public_community_data`, and any direct table read policy. Keep Admin access to all states server-side.
- Preserve comments/votes and report history when a post is hidden or soft-deleted.

### Reports and feedback

- Create an additive `user_reports` table for reports targeting either a community post or a transit route, with reporter, target, reason/details, status (`pending`, `resolved`, `dismissed`), timestamps, and resolving administrator.
- Authenticated registered users submit a report from the existing community-post detail/feed and transit-route detail surfaces. The API derives reporter identity from the verified session and validates target existence and target type.
- Enable RLS. Reporters may create and read only their own report records; only moderators/admins may list all reports and update status/resolution fields. Keep direct browser access to all reports denied.
- Add authenticated Admin list/update endpoints and an existing-style table, filters, and status controls. A report’s resolution state and administrator are persisted.
- Prevent duplicate submissions from a single request through normal validation and report UI pending state; do not silently deduplicate distinct reports from the same user.

### Navigation

- Keep the existing admin URL paths and navigation order. Ensure the operational destinations resolve to their existing pages.
- Do not invent a Settings page or destination without a defined settings capability.

## Compatibility, migrations, and rollback

- Add only new timestamped migrations; do not edit an already-applied migration.
- Initialize existing posts as `published` and preserve existing post and transit records.
- New report rows remain private by default and are exposed only through authenticated own-report submission and Admin APIs governed by RLS.
- Roll back application code independently while leaving additive columns/tables inert; do not automatically drop columns or report data. Any eventual schema removal requires a separate reviewed migration after report-data export/approval.
- Do not apply migrations remotely. A deployment owner must apply the reviewed migrations to the intended Supabase project.

## Verification

- API integration tests: anonymous requests return 401; authenticated non-admins return 403; valid admins can read and mutate; invalid IDs/enums/ownership/status changes return safe errors; self/final-admin guards hold.
- Route service/database tests: two or more ordered mixed terminal/stop entries persist atomically; failed stop insertion leaves no route; soft deletion preserves relationships.
- Community tests: hidden/deleted posts are absent from both authenticated/public reads while still present in Admin results; restore republishes only when status is `published`.
- Reports tests: reporter identity is derived from auth; reporters cannot read others' reports or set status/resolver; admins can list and transition pending/resolved/dismissed records.
- Frontend tests: forms serialize the exact API contracts, filters and details reflect updated live records, and failures stay visible without false success.
- Run `npx tsc --noEmit`, `npm test`, and `npm run build`.

## Decisions and builder calls

- User-selected scope: implement the missing Admin workflows and allow only necessary in-place controls, preserving visual style.
- User-selected approach: secure end-to-end slices.
- User-selected report intake: users can report community posts and transit routes.
- Builder call: use reversible soft deletion rather than physical deletion so route dependencies, reports, and post history remain intact.
- Builder call: prevent self-demotion and demotion/deactivation of the final Admin to avoid administrative lockout.
- Builder call: preserve the current two recognized roles only; do not add new role types.
- Builder call: keep Settings out of scope because there is no settings page or settings behavior in the checked-in application.
- Builder call: route mutations remain gated until the full deployed route schema is verified; available code shows field names but omits the base DDL.
