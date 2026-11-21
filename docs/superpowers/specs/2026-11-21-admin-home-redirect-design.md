# Admin Home Redirect Design

## Intent

Keep role-specific homepages separate: when an authenticated administrator opens `/home`, return them to `/admin/base`.

## Goals

- Redirect only the `admin` role from `/home` to `/admin/base`.
- Preserve the existing Home page for `registered_user` accounts and Landing page for visitors.
- Preserve administrator access to shared registered-user routes such as `/saved` and `/profile`.

## Non-goals

- Do not change authentication, authorization, Supabase roles, RLS, API routes, or other registered-user route guards.
- Do not redirect moderators from `/home` as part of this change.

## Approach

Use the existing database-backed role state in `App`'s `/home` route. Once role loading is complete, detect the `admin` role and render a replacing redirect to `/admin/base`; otherwise preserve the route's existing visitor and registered-user logic.

## Alternatives considered

- Change the shared `protectedPage` guard: rejected because it would remove admin access from shared routes such as `/saved`.
- Change role or authentication architecture: rejected because the existing role loading is already authoritative and sufficient.
