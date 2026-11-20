# Visitor Community Fix

## Root Cause

Visitor Community reads could infer authenticated behavior from Supabase session presence instead of a verified Registered User ID. This could enter the authenticated direct-table API even though the `anon` role had direct Community table access revoked and was expected to use `get_public_community_data()`.

## Fix

- Community post/comment loaders now accept `currentUserId`.
- `currentUserId === null` uses `get_public_community_data()` for posts and comments.
- A verified non-null ID continues through the authenticated Community API.
- Backward-compatible callers without an explicit ID inspect the current session.
- "Locate on Map" now sets the selected post, increments an embedded-map recenter request, and scrolls the existing map container into view.
- It never navigates to `/home`.

## Security

- No anonymous writes or direct anonymous Community table SELECT grants.
- Public RPC output remains allowlisted and excludes hidden posts/comments.
- `profile-photos` remains private.
- The local migration permits only `sign_many` for exact visible-author `/profile` objects.
- No anonymous upload, update, delete, voting, reporting, comment, or post permissions were added.

## Files

- `src/lib/community.ts`
- `src/pages/registered-user/community/community.tsx`
- `src/components/map/CommunityPostMap.tsx`
- `supabase/migrations/20261119235532_anonymous_map_and_community_profiles.sql`

## Verification

- Public-RPC Visitor branch test passed.
- `npx tsc -b --pretty false` passed.
- Production build passed earlier on the same implementation state.
- One recorded baseline hidden-post photo URL assertion remains mismatched.
- No migration was applied or pushed.
- Remote/browser RLS verification requires deployment approval and a working local or linked database.
