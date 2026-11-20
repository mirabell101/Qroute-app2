# Anonymous Map Viewing

## Summary

Visitors (no authenticated session) can use the existing `/home` map route and the existing public map RPC. Community author avatars use the existing private `profile-photos` bucket through narrowly scoped signed-URL operations.

## Visitor and `anon` classification

- **Visitor** is the frontend state with `currentUserId === null`.
- **`anon`** is Supabase's anonymous Postgres role.
- `src/pages/visitor` remains the existing Visitor frontend implementation.
- Registered User and Admin routes and roles are unchanged.

## Frontend changes

- `/home` renders the existing Visitor `Landing` map for logged-out users.
- `/home` preserves the existing Registered `Home` map for authenticated Registered Users and Admins.
- Community "View map" was replaced with "Locate on Map".
- The action navigates to `/home` with a one-time `mapLocation` payload containing latitude, longitude, and label.
- The shared map flys to valid coordinates and renders a temporary pinned marker.
- Invalid or missing coordinates leave the existing map state unchanged.

## Database changes

The new local migration:

- `supabase/migrations/20261119235532_anonymous_map_and_community_profiles.sql`

It replaces `get_public_community_data()` to add public `author_id` values for public posts and comments, while continuing to exclude hidden posts and private profile fields.

It adds one `anon` Storage policy that can use only `storage.object.sign_many` for exact `profile-photos/<author_id>/profile` objects when that author has visible public Community content.

The migration does not:

- add `anon` INSERT, UPDATE, or DELETE grants;
- expose direct map or Community table access;
- expose private profile fields;
- make the `profile-photos` bucket public;
- alter existing RLS policies;
- add a service-role or `SECURITY DEFINER` workaround.
