# Community Reports and Profile Pictures

## Implementation

- Added registered-user reporting for posts, comments, and their authors. The Community API derives reporter, author, content, and comment-parent IDs from verified authentication and RLS-visible records.
- Added the local `community_reports` table with target context, reporter and target foreign keys, text snapshots, reason/status checks, duplicate indexes, and new-table-only RLS policies.
- Added profile-photo signing for registered users viewing visible Community authors. The `profile-photos` bucket remains private.
- Connected Admin reports and dashboard report metrics to `community_reports` through the verified Admin access token. Existing non-report dashboard data access remains unchanged.

## Files changed

- Community UI/client: `src/lib/communityReport.ts`, `src/lib/community.ts`, `src/lib/community.test.ts`, `src/pages/registered-user/community/community.tsx`
- Community API/validation: `server/communityValidation.ts`, `server/communityValidation.test.ts`, `server/routes/communityRoutes.ts`, `server/routes/communityRoutes.test.ts`
- Admin API/UI: `server/admin.ts`, `server/admin.test.ts`, `server/routes/adminRoutes.ts`, `server/routes/adminRoutes.test.ts`, `src/lib/adminApi.ts`, `src/lib/adminApi.test.ts`, `src/pages/admin/reports/reports.tsx`
- Local database artifacts: `supabase/migrations/20261118142625_community_reports.sql`, `supabase/migrations/20261118142627_community_author_photos.sql`, `supabase/tests/community_reports.test.sql`
- Design/plan: `docs/superpowers/specs/2026-11-18-community-reports-and-avatars-design.md`, `docs/superpowers/plans/2026-11-18-community-reports-and-avatars.md`

## Security and moderation

- Report requests do not accept reporter or author identity as trusted input. The reporter defaults to `auth.uid()`; target IDs and snapshots come from the request-scoped authenticated client.
- Only registered users can submit reports. Self-reports, hidden/missing targets, mismatched target types, unsupported reasons, blank `Other` details, and duplicates are rejected.
- Admin listing/status updates use the verified Admin token and the table's Admin RLS policy; Community writes and report reads/status changes do not use the service-role client.
- New RLS/storage policies are additive. No existing policy or migration was modified.
- Admin records retain target kind/context, reporter ID, target author ID/name snapshot, content snapshot, category, explanation, status, and timestamp.

## Verification

- Focused avatar/report-client run: 13 passed; the known hidden-post photo URL assertion was excluded from this focused run.
- Community validation/routes and Admin API/service/client run: 112 passed.
- Full `npm test`: 288 passed, 5 failed. The failures match the recorded baseline: two account-route response assertions, one account API assertion, one account-avatar fixture failure, and the existing Community hidden-photo URL expectation.
- Targeted ESLint for changed API/Admin files: passed. Full `npm run lint`: 10 errors across existing auth/account/UI code, including the Community page's pre-existing `setLoading(true)` effect warning.
- `npm run build`: blocked by four existing account test fixtures missing `googleProfilePhotoUrl`; no errors were reported in the changed report/API code.
- Static migration check: 22 pgTAP assertions match `plan(22)`; RLS is enabled, photo signing is operation-restricted, and neither migration drops a policy. Database-backed pgTAP tests were not run because they could execute saved migrations.
- Whole-branch code review: no Critical, Important, or Minor findings. Browser visual verification was not performed.

## Migration and follow-up

- Local, unpushed migration files: `20261118142625_community_reports.sql` and `20261118142627_community_author_photos.sql`.
- No migration was applied, pushed, or deployed. No remote database operation was performed, and the existing remote project link was not verified.
- Before deployment, verify the intended linked project, review the migrations, and obtain explicit approval to apply them. Then run the database-backed tests and verify Admin/registered-user RLS behavior in that environment.
- No AiderDesk-named resources were found in the repository.
- No dependencies were added. No temporary repository test files were removed.
