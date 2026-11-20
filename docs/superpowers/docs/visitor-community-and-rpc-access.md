# Visitor Community and Public RPC Access

## Root Cause

The shared map used session presence as the authentication decision. A stale or anonymous Supabase session could enter authenticated direct-table loaders, including terminals and transit catalog queries, causing `42501` and bypassing the public map RPC.

## Fix

- `Landing`, `Home`, and `AdminBase` pass explicit `currentUserId` context into `useTransitMap`.
- Terminal, route, catalog, transport, and fare loaders accept optional verified user IDs.
- `null` explicitly selects public RPC data; direct tables remain for verified Registered/Admin flows.
- `getTransitCatalog(null)` builds points/routes from `get_public_map_data()`.
- `/community` remains public and reuses the existing Community component.
- Community post/comment/detail loaders use `currentUserId === null` for `get_public_community_data()`.

## Security

- No broad anonymous table grants.
- No anonymous writes.
- No public Storage bucket or private profile-field exposure.
- Existing RLS, RBAC, and Registered/Admin behavior remain unchanged.

## Verification

- Public transit catalog RED→GREEN test passed.
- TypeScript passed.
- Production build passed.
- Focused suite: 21 passed; the existing hidden-post photo URL baseline assertion remains mismatched.
- No migration application, SQL execution, remote operation, commit, or push performed.
