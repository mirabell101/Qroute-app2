# Community Reports and Author Avatars Design

## Intent

Complete the registered-user Community experience: report a post, comment, or the author responsible; show profile pictures beside post/comment authors; and provide Admins with a usable moderation queue. The currently linked database has no reports table, so `community_reports` is its first report table.

## Goals and boundaries

- Use predefined reasons for all target types. Require a non-empty explanation for `Other`; allow an optional explanation for other reasons.
- Resolve reporter, post, comment, and author identities from verified auth/database state. Reject self-reports, invalid target combinations, and duplicate reports.
- Store target/context IDs and snapshots, status, and timestamps with foreign keys, checks, indexes, and RLS.
- Keep report creation user-scoped and registered-user-only. Keep moderation behind the existing Admin authorization boundary.
- Display private-bucket profile photos only to registered users viewing authors with visible Community content. Keep Visitor Community output and private profile fields unchanged.
- Do not apply, push, or execute any existing or new migration. Do not edit the unapplied legacy reports migration.

## Approaches

1. Reuse an existing `reports` table: rejected because the current database has none, its existing application path is privileged, and the schema does not capture comment targets.
2. Use a service-role write/signing endpoint: rejected because it would bypass RLS.
3. Use a new `community_reports` table with user-scoped RLS, plus a narrow Community-only read policy for profile-photo objects: selected. This follows the explicit authorization requirements and keeps the bucket private.

## Data and authorization design

The new `community_reports` table stores a generated report ID, `reporter_id` defaulted from `auth.uid()`, `target_type` (`post`, `comment`, or `user`), optional post/comment/reported-user IDs, content and reported-name snapshots, reason, optional description, status (`Pending`, `Reviewed`, `Dismissed`), and created/updated timestamps. Foreign keys, target-shape checks, an insert policy that validates target ownership and comment/post pairing, and unique per-reporter/per-target indexes prevent malformed, self, and duplicate reports. On target deletion, retain the text snapshots and do not block Admin post deletion.

RLS is enabled on the new table. Registered users may insert only their own pending report. A reporter may read only their own report; Admins may read all reports and update status. Column privileges prevent clients from choosing reporter ID or status. No existing RLS policy is dropped, replaced, or broadened.

Community report endpoints use `requireAuth`, `requireRegisteredUser`, and the request-scoped Supabase client. The server resolves target rows and author IDs; request bodies contain neither reporter nor author identity. Admin list/status requests use the verified Admin token and the new table's Admin RLS policy.

Profile-photo signed URLs use the existing private `profile-photos` bucket. An additive storage policy permits a registered user to read only the fixed profile object of an author with visible Community content. Authenticated post/comment responses provide author IDs; Visitor RPC results remain unchanged. Live comment broadcasts do not include author IDs, so an open thread is refreshed through the authenticated comments endpoint to obtain canonical IDs.

## Approved decisions

- The new table is the first report source; do not read or combine with the unapplied legacy `reports` migration.
- Add the narrow Community-author profile-photo policy.
- Integrate new reports into the existing Admin Reports page and moderation workflow.
- Leave all migrations local and unpushed.

## Non-goals

No remote database operations, authentication/RBAC redesign, public profile-data exposure, public profile-photo bucket, Visitor Community changes, or unrelated refactoring.
