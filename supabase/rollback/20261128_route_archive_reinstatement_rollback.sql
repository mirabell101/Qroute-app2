-- Rollback for 20261128_route_archive_reinstatement.sql
-- Removes only the public archive recovery status, reinstatement, and reconciliation RPCs. It does NOT undo completed
-- reinstatements or remove archive snapshots/triggers created by the earlier
-- route archive trigger migration.

BEGIN;

DROP FUNCTION IF EXISTS public.reconcile_restored_route_archive(bigint);
DROP FUNCTION IF EXISTS public.reinstate_archived_route(bigint);
DROP FUNCTION IF EXISTS public.get_route_archive_recovery_status();

COMMIT;
