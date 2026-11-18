# Admin Notifications and Post Visibility Design

## Intent

Make community post reporting and moderation persistent and backend-enforced. A
post with three pending reports from distinct registered users creates one
durable admin notification. Admins can view and mark notifications read, and
can persistently hide or restore posts. Hiding must remove the post and its
photos from ordinary Community access without changing authentication or admin
role assignment.

## Current state

- `public.reports` already stores report descriptions and the `Pending`,
  `Reviewed`, and `Dismissed` statuses, but has no post FK or reporter UUID.
  The checked-in app has no Community report submission path or threshold
  implementation.
- `community_posts` has no visibility field. Admin post visibility controls
  currently exist only in frontend state.
- Signed-in Community reads use `/api/community/posts` and request-scoped
  Supabase clients. Anonymous reads use
  `get_public_community_data`, a `SECURITY DEFINER` RPC that currently omits
  photo paths.
- `community-post-photos` is a public bucket. Community image URLs therefore
  bypass Storage RLS. The existing Admin API already applies `requireAuth`
  followed by `requireAdmin`; the existing Supabase admin client is server-only.
- Existing reports and the Admin report status workflow must remain intact.
  No hosted schema or policy inspection/application is available in this
  environment.

## Goals

- Add a registered-user report action for Community posts using the existing
  `reports` table and statuses.
- Count only unique, linked reports with `status = 'Pending'`. Three distinct
  registered users reporting the same post creates exactly one notification
  event for that post. Repeated reports from one user are rejected, and
  existing unlinked report rows are neither inferred nor backfilled.
- Persist notification events and per-admin read receipts. Show each admin's
  unread count, a dedicated Notifications page, a View Report action, and a
  persistent mark-as-read action.
- Persist post visibility in Supabase. Ordinary users can read visible posts
  only; admins can read and manage both visible and hidden posts.
- Make photo access follow post visibility on every request. Anonymous
  visitors and signed-in regular users can view visible-post photos without
  requiring admin access; only admins can view hidden-post photos.
- Preserve existing authentication, role checks, report review, post deletion,
  visible-post Community behavior, upload/delete ownership, and admin UI
  styling.

## Non-goals

- Changing Google OAuth, Supabase session restoration, role assignment, or
  backend API configuration.
- Adding a second report table, changing report status vocabulary, or changing
  database/RLS behavior on the hosted project from this environment.
- Adding notifications for non-Community reports or retroactively generating
  notifications from unlinked legacy report rows.
- Applying migrations remotely, changing production settings, or making
  destructive data changes.
- Changing how posts are deleted; this feature only adds hide/restore.

## Approaches

1. **Private bucket with a visibility-checking proxy (selected).** Keep the
   bucket private; check current visibility before serving each image. The
   public Community RPC exposes photo paths only for visible posts, and the
   public proxy serves those photos without login. A separate existing-admin-
   protected endpoint serves photos for hidden posts. This meets the selected
   anonymous-photo behavior and prevents direct Storage URLs from bypassing
   visibility.
2. **Private bucket with an authenticated-only proxy (not selected).** This
   would leave anonymous users unable to see photos, contrary to the selected
   behavior.
3. **Keep the bucket public and use RLS alone (rejected).** Public Storage URLs
   bypass object RLS, so a hidden post's photo could still be fetched by anyone
   who has its URL.

## Design

### Report intake and threshold

- Add nullable `community_post_id` and `reporter_user_id` columns to
  `public.reports`, with data-preserving foreign keys. Add a partial unique
  index on `(community_post_id, reporter_user_id)` for linked reports so a
  registered user can report a post only once. Legacy unlinked rows remain
  valid.
- Add a Community report API protected by the existing authentication and
  registered-user middleware. Derive reporter identity from the verified
  request user, load the post through the user's RLS-scoped client, and use the
  server-only admin client for the linked report insert only after those
  checks. The browser cannot supply reporter identity or admin authority.
- Narrow direct authenticated report inserts to unlinked legacy reports;
  linked Community reports use the protected server route. Preserve the
  existing admin SELECT/UPDATE policies and report statuses.
- Add an atomic database trigger that checks the linked post's pending report
  count after a report insert or relevant status change. At three distinct
  pending reporters, insert one notification event with a unique per-post key.
  `ON CONFLICT DO NOTHING` makes retries and later refreshes idempotent.
- Keep report rows and notification events if a post is physically deleted:
  the report's FK is set null, while the notification retains its post UUID
  snapshot and a report ID for the Reports-page link.

### Notifications

- Add an `admin_notifications` event table with title, message, post UUID
  snapshot, report ID, and timestamp. Enforce one event per post.
- Add `admin_notification_reads`, keyed by notification and admin user, with a
  read timestamp. An admin's unread count is computed from missing receipts;
  another admin's read action does not mark the event read for everyone.
- Enable RLS on both tables. Only current database admins may read events;
  an admin may create/read only their own receipt. Admin API routes also use
  the existing `requireAuth` and `requireAdmin` boundary.
- Add a dedicated protected page and route, keep the current Marabells admin
  visual style, display title/message/date/read state, and link View Report to
  the triggering report ID in the existing Reports page.

### Persistent visibility

- Add `community_posts.is_hidden boolean NOT NULL DEFAULT false`; existing and
  new posts remain visible by default.
- Replace the broad post SELECT policy with visible-post access for ordinary
  users and all-post access for database admins. Keep the existing registered
  author and photo-path ownership checks on INSERT, adding only a requirement
  that user-created posts start visible. Add a column-scoped admin update
  grant/policy for `is_hidden`, with both `USING` and `WITH CHECK`.
- Update the admin post list to load `is_hidden` from the backend. Add a
  validated admin visibility endpoint that changes only that column and
  returns an explicit success/error result. The ordinary Community API and
  anonymous RPC omit hidden posts; comments remain inaccessible through the
  existing parent-post check.
- Preserve existing admin report and post-delete behavior. No report table,
  authentication, or role-assignment logic is replaced.

### Photo visibility

- Set `community-post-photos` private and replace its SELECT policy with one
  that checks the associated post's visibility through post RLS. Preserve
  existing registered-user upload and owner-delete policies.
- Update the public RPC to omit hidden posts and return the photo paths of
  visible posts only. Paths are object identifiers, not credentials.
- Add a public, no-store photo proxy route. It validates the post UUID and
  photo index, rechecks that the post is currently returned by the public RPC,
  and only then downloads and streams the object server-side. It does not
  expose a service-role key or a reusable public Storage URL.
- Add a separate photo route under the existing protected Admin API for
  hidden-post images. It must validate that the requested path belongs to the
  requested post and use the verified admin boundary. Missing/hidden posts
  return not-found to ordinary callers. Direct public Storage URLs stop
  working.
- A request after a post is hidden is denied. Image bytes already downloaded
  or retained by a user cannot be recalled; responses use no-store caching to
  avoid serving stale cached images.

## Rollout and rollback

- Use only new, additive migrations; do not edit prior migrations or apply
  anything to a hosted database in this task.
- Coordinate application rollout with the private-bucket/policy change because
  existing clients use direct public URLs. The new proxy must be deployed and
  verified before or alongside switching the bucket private; old clients may
  need a reload during the coordinated rollout.
- For an application rollback, disable the new UI/API first and keep additive
  schema and data. Do not automatically drop columns, tables, report rows,
  notification events, or visibility state.
- Restoring the previous public bucket setting restores direct-URL behavior
  but makes photos of hidden posts publicly fetchable. A rollback that keeps
  hidden-photo privacy must retain the private bucket and compatible proxy.
  Any rollback that weakens this protection requires a separate explicit
  decision; no such action is authorized here.

## Verification

- Database-focused tests cover report uniqueness, threshold at two/three
  pending reporters, status transitions, one notification per post, and
  per-admin read receipts.
- API tests cover unauthenticated and non-registered report rejection,
  reporter identity derivation, duplicate reporting, admin-only notification
  and visibility operations, and safe not-found behavior.
- Community tests cover visible/hidden reads for anonymous, registered, and
  admin callers; hidden comments; visible photo proxy access; denial of hidden
  photos to ordinary callers; and admin access to hidden photos.
- Frontend tests cover unread counts, bell navigation, View Report targeting,
  persisted read state, hide/restore feedback, and state after reload.
- Run focused tests, auth/admin regressions, full test suite, TypeScript,
  targeted ESLint, and production build. Since no hosted Supabase connection is
  available, hosted RLS/storage behavior remains unverified until the reviewed
  migration is applied and tested against that project.

## Decisions and builder calls

- User-selected threshold: three unique pending reports from distinct
  registered users.
- User-selected photo behavior: anonymous and regular users may view photos
  of visible posts without admin access; hidden-post photos require admin.
- User-selected notification semantics: one durable event per post, with
  per-admin persistent read state.
- Builder call: retain legacy unlinked report submissions and rows, but do not
  let them count toward the Community threshold.
- Builder call: keep per-post notification events after post deletion and link
  them to the triggering report snapshot rather than cascading notification
  data away.
- Builder call: preserve existing visible-public Community content while
  moving image delivery behind a visibility-checking proxy.
