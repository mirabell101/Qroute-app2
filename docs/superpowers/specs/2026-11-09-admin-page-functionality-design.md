# QRoute Admin Page Functionality Design

**Status:** Approved by user  
**Chosen scope:** Existing-schema-only

## Intent

Make the existing Admin Page truthful, data-backed, and safe without replacing
its dashboard or inventing database features. Preserve the current Google OAuth
and password-authentication work already present in the worktree.

## Current evidence

- The existing dashboard uses hard-coded statistics and a fabricated
  attendance entry.
- Route add/edit changes only component state. Its origin/destination/fare
  fields do not represent QRoute's multi-stop route, transport variant, and
  fare-rule model.
- User, report, and community-post records are sample arrays; their status
  changes only update component state.
- The checked-in schema references show `routes`, `route_stops`, `stops`,
  `terminals`, `transport_types`, `transport_variants`, `community_posts`,
  `user_roles`, and `profiles`. The repository does not include a complete
  database schema or a schema-only snapshot.
- No checked-in report table, post-visibility field, report-submission flow,
  admin settings page, or settings persistence model was found.
- `/admin/*` is guarded in the frontend by the database role. Existing Express
  routes do not provide admin-only authorization middleware. The existing
  `requireAuth` middleware verifies the bearer token with Supabase Auth and
  places the verified user and token in the request context. The checked-in
  role lookup uses `user_roles.user_id` and `user_roles.role`; there is no
  existing server-side admin middleware.
- Admin navigation includes a Settings destination that has no matching route.
  The admin landing page also has controls with no corresponding action.
- Existing application destinations are available for Recents, Saved,
  Contribution, Community, and Profile. The shared map controller has no
  vehicle-filter action, and there is no notification destination.

## Goals

- Keep the existing Admin Page and visual structure; do not create a new
  dashboard.
- Replace sample values with database-backed data only where the checked-in
  model establishes the source and fields.
- Add explicit loading, error, empty, and unavailable states; never report
  local-only state changes as persisted.
- Enforce administrator authorization at the server boundary for any admin
  API added. Verify the bearer token and read the role from `user_roles`; never
  trust request data, email, provider, or user-editable metadata for a role.
- Preserve the existing frontend role guard and all OAuth/password behavior.
- Wire only existing navigation destinations and actions that are supported by
  existing application functionality.

## Non-goals and safety boundaries

- No new tables, columns, RLS policies, grants, or remote database changes.
- No fabricated report records, post visibility state, ban state, or settings.
- No mapping of the current simple route form onto the richer route/fare model.
- No new report-submission, notification, or settings product features.
- No OAuth, password-authentication, or session-flow changes.
- No staging, committing, branch switching, or pushing.

Because the actual database schema is unavailable in this workspace, the
implementation must stop short of any read/write operation whose columns,
constraints, or authorization behavior cannot be established from checked-in
source. Unsupported controls should be made visibly unavailable rather than
left looking successful. In particular, route CRUD, report processing, post
visibility changes, user bans, and persisted settings remain blocked until
their backing schema and behavior are verified. This is an intentional
limitation of the selected scope, not a substitute feature.

The checked-in code establishes the following safe read sources for this
scope: route records and their ordered stops from `routes`/`route_stops` and
their referenced transport/point tables; community-post records from
`community_posts`; account-role records from `user_roles`; and profile names
from `profiles`. The server already has a privileged Supabase Auth client for
trusted backend operations, which may be used for an admin-only user listing
after the new server-side role check. It must not be used to fake account
status or implement ban/unban in this scope.

## Approaches considered

1. **Existing-schema-only (selected).** Use only data and operations supported
   by checked-in schema evidence, add server-side admin checks where an admin
   API is justified, and surface unsupported modules clearly. This avoids
   schema guesses, migrations, and false success.
2. **Complete every current mock action.** Add or alter persistent data models
   and access policies for reports, post moderation, bans, and settings. This
   could make more controls operational, but needs verified live schema and
   explicit review of migrations/RLS changes, and risks inventing product
   behavior.
3. **Frontend-only Supabase wiring.** Connect pages directly to client queries.
   This is not selected because it would not provide the required independent
   server-side admin authorization for privileged actions.

## Implementation outline

1. Keep the existing authentication flow and protect admin APIs independently:
   validate the access token using the existing auth middleware, then confirm
   the verified user's `user_roles` entry on the server. Fail closed on lookup
   errors or any role other than `admin`.
2. Replace the dashboard's registered-user, route, and post fixture counts
   with counts from `user_roles`, `routes`, and `community_posts`. The report
   card and attendance feed have no checked-in data source; present them as
   unavailable instead of inventing a count or activity.
3. Connect read-only route, user, and community-post lists to the existing
   records. Route detail must use the existing multi-stop/transport schema, not
   the mock origin/destination/fare shape. Do not expose privileged credentials
   to the browser or bypass RLS as a convenience.
4. Make unsupported writes visibly unavailable: route add/edit/delete,
   post-visibility changes, report processing, user ban/unban, and settings
   persistence. No schema or security policy change is allowed in this scope.
5. Wire admin-landing navigation to existing application routes. Leave
   notifications and map filters visibly unavailable because no corresponding
   destination/action exists.
6. Add focused tests for the authorization and data-state behavior that can be
   expressed without an external Supabase instance. Do not run builds, tests,
   or other target-controlled code unless an OS-enforced isolated sandbox is
   available. Browser, live-database, and login checks require a configured
   test environment and must be reported separately if unavailable.
7. Review the final diff and produce the requested Git Push Preparation Report.
   Do not commit or push without separate user approval.

## Remaining to the builder

- Reuse existing API, role, and UI conventions.
- Avoid touching any pre-existing staged, unstaged, or untracked Google-auth
  changes.
- If an operation depends on database facts absent from checked-in source,
  report it as blocked; do not infer a schema or add a migration under this
  scope.
