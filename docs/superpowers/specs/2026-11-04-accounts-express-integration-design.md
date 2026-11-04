# Accounts Express Integration Design

## Intent

Keep the existing Accounts page appearance and interactions, but load and save supported account data through the Express backend so Supabase Auth and the owner-scoped profile record—not browser mock state—are authoritative.

## Goals and non-goals

- Load the signed-in user's email from verified auth context and username from their `public.profiles` row.
- Persist username and password changes through authenticated Express operations.
- Preserve profile-photo upload with private, per-user storage and no account-specific browser persistence.
- Keep Points and Badges sections, but remove locally calculated rewards and show that the feature is not available yet, including on the separate Points and Badges page.
- Do not add points, badges, contribution calculations, email editing, or a new profile table.
- Do not change the page layout, styling, navigation, or unrelated auth behavior.

## Approaches

1. **Request-scoped Express account API (selected).** Add a small `/api/account` router using `requireAuth` and the existing token-scoped Supabase client. This keeps identity derivation and data access on the server while RLS remains active.
2. **Direct frontend Supabase operations (rejected).** This would bypass the requested Express integration and duplicate the server's auth/data responsibilities.
3. **Service-role account updates (rejected).** This would bypass owner RLS and is unnecessary for a user-scoped endpoint.

## Design

- `GET /api/account` returns only the verified user's email, username, and a short-lived signed URL for their profile photo. The account ID comes from `res.locals.user`; no request-supplied ID selects a record.
- `PATCH /api/account` validates the existing username format and updates only `profiles.username` for the verified ID. Existing owner-only RLS remains in force. A unique-name conflict returns a user-safe conflict response.
- `PUT /api/account/password` validates both passwords, verifies the current password against the email from verified auth context, checks the authenticated identity, then updates that account's password. Passwords and tokens are never logged or returned.
- `PUT /api/account/photo` accepts only supported image MIME types up to 5 MB and stores/replaces one deterministic object under the verified user's folder in a private `profile-photos` bucket. The route returns a signed URL; it never accepts an owner ID or arbitrary storage path.
- The database migration adds `UPDATE(username)` to the `authenticated` role (the existing `profiles` owner-only UPDATE policy is unchanged) and creates the private photo bucket with owner-folder SELECT/INSERT/UPDATE policies. No profile column or points/badges schema is added.
- The frontend obtains the current Supabase access token, verifies that its session ID matches the page's authenticated ID, and calls the account API. It uses server responses/errors for displayed state and preserves existing form validation and message styling.
- The old `qroute_accounts` local record is not an account source. Once the server profile loads, the frontend may migrate only a bounded image data URL from the record whose stored `id` exactly matches the current server-verified user ID; the server stores it in that user's private folder. The ID match is a safety filter, not cryptographic proof of local data provenance. Username, email, and password fields are ignored, and the entire legacy local key is removed after server profile load.
- Profile and Points and Badges pages retain their existing sections and styling, replacing calculated reward values and hardcoded badge milestones with a clear not-yet-available state.

## Verification

Add focused frontend/API and Express route tests for account reads, username persistence/validation, password validation and identity checks, photo MIME/size/ownership behavior, rejected unauthenticated or cross-account requests, and unavailable Points/Badges states. Run the focused suite, full `npm test`, `npm run lint`, and `npm run build`. Verify the migration's owner-scoped policies and grants after application.

## Decisions and approval

The user selected dedicated private photo storage and approved the additive database changes described above. No implementation or remote database change begins until this design is approved.
For legacy image data, the user chose migration only from a matching stored ID and valid image data URL; the key is cleared once the server profile has loaded.
