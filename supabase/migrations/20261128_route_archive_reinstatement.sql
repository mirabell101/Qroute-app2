-- QRoute: guarded route archive reinstatement
-- Requires the archive-capture migration:
--   route_management_internal.route_archive_operations
--   route_management_internal.route_archive_location_snapshots
--
-- Security model:
--   * authenticated users may invoke the public RPCs, but only admins pass
--     the role check inside each SECURITY DEFINER function.
--   * internal recovery tables remain inaccessible to client roles.
--   * route restoration requires an exact match with the archived route row.
--   * individual locations are restored only on exact archived-row matches;
--     changed or missing locations are reported and never overwritten.
--   * only lifecycle fields are restored from original_row. All other fields
--     are preserved, and are known to match because of the exact comparison.

BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('route_management_internal.route_archive_operations') IS NULL
       OR to_regclass('route_management_internal.route_archive_location_snapshots') IS NULL
    THEN
        RAISE EXCEPTION
            'Route archive recovery tables are missing. Apply the route archive trigger migration first.';
    END IF;

    IF to_regprocedure('route_management_internal.capture_route_archive()') IS NULL THEN
        RAISE EXCEPTION
            'The route archive capture function is missing. Apply the route archive trigger migration first.';
    END IF;
END;
$preflight$;

-- -----------------------------------------------------------------------------
-- Admin-only recovery metadata for the Route Management Archived filter.
-- Returns safe summaries only; never exposes original_row / archived_row JSON.
-- Includes open operations whose route is no longer archived so stale recovery
-- operations can be identified without silently taking another snapshot.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_route_archive_recovery_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_role text;
    v_result jsonb;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role_row.role::text
    INTO v_role
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = v_actor;

    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Administrator access required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'routeId', route_row.id,
                'archiveOperationId', operation.archive_operation_id,
                'archivedAt', operation.archived_at,
                'canReinstate', (
                    operation.archive_operation_id IS NOT NULL
                    AND route_row.is_deleted IS TRUE
                    AND pg_catalog.to_jsonb(route_row)
                        IS NOT DISTINCT FROM operation.route_archived_after
                ),
                'canReconcile', (
                    operation.archive_operation_id IS NOT NULL
                    AND route_row.is_deleted IS FALSE
                    AND pg_catalog.to_jsonb(route_row)
                        IS NOT DISTINCT FROM operation.route_before
                    AND location_stats.changed_from_original_count = 0
                    AND location_stats.missing_from_original_count = 0
                ),
                'recoveryStatus', CASE
                    WHEN operation.archive_operation_id IS NULL
                        THEN 'legacy_archive'
                    WHEN route_row.is_deleted IS FALSE
                         AND pg_catalog.to_jsonb(route_row)
                            IS NOT DISTINCT FROM operation.route_before
                         AND location_stats.changed_from_original_count = 0
                         AND location_stats.missing_from_original_count = 0
                        THEN 'already_restored_untracked'
                    WHEN route_row.is_deleted IS FALSE
                         AND pg_catalog.to_jsonb(route_row)
                            IS NOT DISTINCT FROM operation.route_before
                        THEN 'already_restored_needs_review'
                    WHEN route_row.is_deleted IS FALSE
                        THEN 'route_state_changed'
                    WHEN pg_catalog.to_jsonb(route_row)
                         IS DISTINCT FROM operation.route_archived_after
                        THEN 'route_changed'
                    WHEN location_stats.changed_location_count > 0
                         OR location_stats.missing_location_count > 0
                        THEN 'locations_need_review'
                    ELSE 'ready'
                END,
                'reason', CASE
                    WHEN operation.archive_operation_id IS NULL
                        THEN 'No recovery snapshot exists. This route was archived before archive tracking was installed.'
                    WHEN route_row.is_deleted IS FALSE
                         AND pg_catalog.to_jsonb(route_row)
                            IS NOT DISTINCT FROM operation.route_before
                         AND location_stats.changed_from_original_count = 0
                         AND location_stats.missing_from_original_count = 0
                        THEN 'The route and all snapshotted locations already match their exact original rows. Recovery history can be safely finalized without changing route or location data.'
                    WHEN route_row.is_deleted IS FALSE
                         AND pg_catalog.to_jsonb(route_row)
                            IS NOT DISTINCT FROM operation.route_before
                        THEN 'The route matches its original row, but one or more snapshotted locations do not match their original rows. Automatic reconciliation is blocked for manual review.'
                    WHEN route_row.is_deleted IS FALSE
                        THEN 'The route is no longer archived and no longer matches its original pre-archive row. Manual review is required.'
                    WHEN pg_catalog.to_jsonb(route_row)
                         IS DISTINCT FROM operation.route_archived_after
                        THEN 'The route changed after it was archived. Automatic reinstatement is blocked to protect later changes.'
                    WHEN location_stats.changed_location_count > 0
                         OR location_stats.missing_location_count > 0
                        THEN 'The route can be reinstated, but changed or missing locations will be left untouched for manual review.'
                    ELSE 'The route matches its archive snapshot and can be safely reinstated.'
                END,
                'locationSnapshotCount', location_stats.location_snapshot_count,
                'changedLocationCount', location_stats.changed_location_count,
                'missingLocationCount', location_stats.missing_location_count,
                'changedFromOriginalCount', location_stats.changed_from_original_count,
                'missingFromOriginalCount', location_stats.missing_from_original_count
            )
            ORDER BY route_row.id
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM public.routes AS route_row
    LEFT JOIN LATERAL (
        SELECT operation_row.*
        FROM route_management_internal.route_archive_operations AS operation_row
        WHERE operation_row.route_id = route_row.id
          AND operation_row.reinstated_at IS NULL
        ORDER BY operation_row.archived_at DESC
        LIMIT 1
    ) AS operation ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            pg_catalog.count(*)::integer AS location_snapshot_count,
            pg_catalog.count(*) FILTER (
                WHERE location_row.current_row IS NOT NULL
                  AND location_row.current_row IS DISTINCT FROM location_row.archived_row
            )::integer AS changed_location_count,
            pg_catalog.count(*) FILTER (
                WHERE location_row.current_row IS NULL
            )::integer AS missing_location_count,
            pg_catalog.count(*) FILTER (
                WHERE location_row.current_row IS NOT NULL
                  AND location_row.current_row IS DISTINCT FROM location_row.original_row
            )::integer AS changed_from_original_count,
            pg_catalog.count(*) FILTER (
                WHERE location_row.current_row IS NULL
            )::integer AS missing_from_original_count
        FROM (
            SELECT
                snapshot.original_row,
                snapshot.archived_row,
                CASE
                    WHEN snapshot.entity_type = 'stop'
                        THEN pg_catalog.to_jsonb(stop_row)
                    ELSE pg_catalog.to_jsonb(terminal_row)
                END AS current_row
            FROM route_management_internal.route_archive_location_snapshots AS snapshot
            LEFT JOIN public.stops AS stop_row
                ON snapshot.entity_type = 'stop'
               AND stop_row.id = snapshot.entity_id
            LEFT JOIN public.terminals AS terminal_row
                ON snapshot.entity_type = 'terminal'
               AND terminal_row.id = snapshot.entity_id
            WHERE snapshot.archive_operation_id = operation.archive_operation_id
        ) AS location_row
    ) AS location_stats ON TRUE
    WHERE route_row.is_deleted IS TRUE
       OR operation.archive_operation_id IS NOT NULL;

    RETURN v_result;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Reinstates one route and only the locations changed by its archive operation.
-- Route state must still exactly match route_archived_after. Changed/missing
-- locations are skipped individually and reported in the result.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reinstate_archived_route(
    p_route_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_role text;
    v_route public.routes%ROWTYPE;
    v_operation route_management_internal.route_archive_operations%ROWTYPE;
    v_snapshot route_management_internal.route_archive_location_snapshots%ROWTYPE;
    v_current_row jsonb;
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_restored_count integer := 0;
    v_changed_count integer := 0;
    v_missing_count integer := 0;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role_row.role::text
    INTO v_role
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = v_actor;

    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Administrator access required.'
            USING ERRCODE = '42501';
    END IF;

    IF p_route_id IS NULL OR p_route_id <= 0 THEN
        RAISE EXCEPTION 'A valid route ID is required.'
            USING ERRCODE = '22023';
    END IF;

    -- Serialize with route, route_stops, proposal, and archive operations.
    PERFORM pg_catalog.pg_advisory_xact_lock(913713, 42001);

    SELECT route_row.*
    INTO v_route
    FROM public.routes AS route_row
    WHERE route_row.id = p_route_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The archived route no longer exists.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_route.is_deleted IS NOT TRUE THEN
        RAISE EXCEPTION
            'This route is no longer archived. Refresh Route Management and review its recovery history.'
            USING ERRCODE = '55000';
    END IF;

    SELECT operation_row.*
    INTO v_operation
    FROM route_management_internal.route_archive_operations AS operation_row
    WHERE operation_row.route_id = p_route_id
      AND operation_row.reinstated_at IS NULL
    ORDER BY operation_row.archived_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No open archive recovery snapshot exists for this route. It may be a legacy archive and requires manual review.'
            USING ERRCODE = '55000';
    END IF;

    -- Never restore a route whose current row differs from the exact row
    -- written by the archive operation. This prevents overwriting later edits.
    IF pg_catalog.to_jsonb(v_route)
       IS DISTINCT FROM v_operation.route_archived_after
    THEN
        RAISE EXCEPTION
            'The route changed after it was archived. Automatic reinstatement is blocked to protect later changes.'
            USING ERRCODE = '40001';
    END IF;

    -- Lock snapshotted stops and terminals in deterministic order before
    -- checking/updating any of them.
    PERFORM stop_row.id
    FROM public.stops AS stop_row
    JOIN route_management_internal.route_archive_location_snapshots AS snapshot
      ON snapshot.entity_type = 'stop'
     AND snapshot.entity_id = stop_row.id
    WHERE snapshot.archive_operation_id = v_operation.archive_operation_id
      AND snapshot.restore_status = 'pending'
    ORDER BY stop_row.id
    FOR UPDATE OF stop_row;

    PERFORM terminal_row.id
    FROM public.terminals AS terminal_row
    JOIN route_management_internal.route_archive_location_snapshots AS snapshot
      ON snapshot.entity_type = 'terminal'
     AND snapshot.entity_id = terminal_row.id
    WHERE snapshot.archive_operation_id = v_operation.archive_operation_id
      AND snapshot.restore_status = 'pending'
    ORDER BY terminal_row.id
    FOR UPDATE OF terminal_row;

    -- The route itself is restored to its exact pre-archive lifecycle state.
    -- This preserves its previous mute/ban state rather than forcing it active.
    UPDATE public.routes AS route_row
    SET
        is_active = (v_operation.route_before ->> 'is_active')::boolean,
        is_banned = (v_operation.route_before ->> 'is_banned')::boolean,
        is_deleted = (v_operation.route_before ->> 'is_deleted')::boolean,
        deleted_at = (v_operation.route_before ->> 'deleted_at')::timestamptz,
        deleted_by = (v_operation.route_before ->> 'deleted_by')::uuid
    WHERE route_row.id = p_route_id;

    -- Restore each location only if the complete current row still matches the
    -- exact archived row. A mismatch is recorded, not overwritten.
    FOR v_snapshot IN
        SELECT snapshot.*
        FROM route_management_internal.route_archive_location_snapshots AS snapshot
        WHERE snapshot.archive_operation_id = v_operation.archive_operation_id
          AND snapshot.restore_status = 'pending'
        ORDER BY
            CASE snapshot.entity_type WHEN 'stop' THEN 1 ELSE 2 END,
            snapshot.entity_id
        FOR UPDATE
    LOOP
        v_current_row := NULL;

        IF v_snapshot.entity_type = 'stop' THEN
            SELECT pg_catalog.to_jsonb(stop_row)
            INTO v_current_row
            FROM public.stops AS stop_row
            WHERE stop_row.id = v_snapshot.entity_id
            FOR UPDATE;

            IF NOT FOUND THEN
                UPDATE route_management_internal.route_archive_location_snapshots
                SET
                    restore_status = 'missing',
                    restore_note = 'The location no longer exists; no record was recreated.'
                WHERE location_snapshot_id = v_snapshot.location_snapshot_id;
                v_missing_count := v_missing_count + 1;

            ELSIF v_current_row IS DISTINCT FROM v_snapshot.archived_row THEN
                UPDATE route_management_internal.route_archive_location_snapshots
                SET
                    restore_status = 'skipped_changed',
                    restore_note = 'The location changed after archiving; its current state was preserved.'
                WHERE location_snapshot_id = v_snapshot.location_snapshot_id;
                v_changed_count := v_changed_count + 1;

            ELSE
                UPDATE public.stops AS stop_row
                SET
                    is_active = (v_snapshot.original_row ->> 'is_active')::boolean,
                    is_deleted = (v_snapshot.original_row ->> 'is_deleted')::boolean,
                    deleted_at = (v_snapshot.original_row ->> 'deleted_at')::timestamptz,
                    deleted_by = (v_snapshot.original_row ->> 'deleted_by')::uuid
                WHERE stop_row.id = v_snapshot.entity_id;

                UPDATE route_management_internal.route_archive_location_snapshots
                SET
                    restore_status = 'restored',
                    restore_note = 'Restored the original lifecycle state captured by this route archive operation.',
                    restored_at = v_now
                WHERE location_snapshot_id = v_snapshot.location_snapshot_id;
                v_restored_count := v_restored_count + 1;
            END IF;

        ELSE
            SELECT pg_catalog.to_jsonb(terminal_row)
            INTO v_current_row
            FROM public.terminals AS terminal_row
            WHERE terminal_row.id = v_snapshot.entity_id
            FOR UPDATE;

            IF NOT FOUND THEN
                UPDATE route_management_internal.route_archive_location_snapshots
                SET
                    restore_status = 'missing',
                    restore_note = 'The location no longer exists; no record was recreated.'
                WHERE location_snapshot_id = v_snapshot.location_snapshot_id;
                v_missing_count := v_missing_count + 1;

            ELSIF v_current_row IS DISTINCT FROM v_snapshot.archived_row THEN
                UPDATE route_management_internal.route_archive_location_snapshots
                SET
                    restore_status = 'skipped_changed',
                    restore_note = 'The location changed after archiving; its current state was preserved.'
                WHERE location_snapshot_id = v_snapshot.location_snapshot_id;
                v_changed_count := v_changed_count + 1;

            ELSE
                UPDATE public.terminals AS terminal_row
                SET
                    is_active = (v_snapshot.original_row ->> 'is_active')::boolean,
                    is_deleted = (v_snapshot.original_row ->> 'is_deleted')::boolean,
                    deleted_at = (v_snapshot.original_row ->> 'deleted_at')::timestamptz,
                    deleted_by = (v_snapshot.original_row ->> 'deleted_by')::uuid
                WHERE terminal_row.id = v_snapshot.entity_id;

                UPDATE route_management_internal.route_archive_location_snapshots
                SET
                    restore_status = 'restored',
                    restore_note = 'Restored the original lifecycle state captured by this route archive operation.',
                    restored_at = v_now
                WHERE location_snapshot_id = v_snapshot.location_snapshot_id;
                v_restored_count := v_restored_count + 1;
            END IF;
        END IF;
    END LOOP;

    UPDATE route_management_internal.route_archive_operations
    SET
        reinstated_by = v_actor,
        reinstated_at = v_now,
        reinstatement_result = pg_catalog.jsonb_build_object(
            'route_id', p_route_id,
            'restored_location_count', v_restored_count,
            'skipped_changed_location_count', v_changed_count,
            'missing_location_count', v_missing_count,
            'completed_at', v_now
        )
    WHERE archive_operation_id = v_operation.archive_operation_id
      AND reinstated_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'The archive operation was already completed by another request.'
            USING ERRCODE = '40001';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'routeId', p_route_id,
        'archiveOperationId', v_operation.archive_operation_id,
        'status', 'reinstated',
        'restoredLocationCount', v_restored_count,
        'skippedChangedLocationCount', v_changed_count,
        'missingLocationCount', v_missing_count,
        'reinstatedAt', v_now
    );
END;
$function$;

-- -----------------------------------------------------------------------------
-- Safely closes an open archive operation when records have already been
-- restored out-of-band and every current row exactly matches its original
-- snapshot. This function changes recovery metadata only: it does not UPDATE
-- public.routes, public.stops, or public.terminals.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_restored_route_archive(
    p_route_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_role text;
    v_route public.routes%ROWTYPE;
    v_operation route_management_internal.route_archive_operations%ROWTYPE;
    v_snapshot route_management_internal.route_archive_location_snapshots%ROWTYPE;
    v_current_row jsonb;
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_location_count integer := 0;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role_row.role::text
    INTO v_role
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = v_actor;

    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Administrator access required.'
            USING ERRCODE = '42501';
    END IF;

    IF p_route_id IS NULL OR p_route_id <= 0 THEN
        RAISE EXCEPTION 'A valid route ID is required.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(913713, 42001);

    SELECT route_row.*
    INTO v_route
    FROM public.routes AS route_row
    WHERE route_row.id = p_route_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The route no longer exists.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT operation_row.*
    INTO v_operation
    FROM route_management_internal.route_archive_operations AS operation_row
    WHERE operation_row.route_id = p_route_id
      AND operation_row.reinstated_at IS NULL
    ORDER BY operation_row.archived_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No open archive operation exists for this route. It may already have been reinstated or may be a legacy archive.'
            USING ERRCODE = '55000';
    END IF;

    -- Reconciliation is allowed only when the whole live route exactly equals
    -- the before-image captured by the archive trigger. Lifecycle fields alone
    -- are not sufficient evidence.
    IF v_route.is_deleted IS NOT FALSE
       OR pg_catalog.to_jsonb(v_route)
            IS DISTINCT FROM v_operation.route_before
    THEN
        RAISE EXCEPTION
            'The current route does not exactly match its original pre-archive row. Recovery history cannot be finalized automatically.'
            USING ERRCODE = '40001';
    END IF;

    -- Acquire location locks in deterministic entity/id order, then verify
    -- every captured location against its exact original full-row snapshot.
    FOR v_snapshot IN
        SELECT snapshot.*
        FROM route_management_internal.route_archive_location_snapshots AS snapshot
        WHERE snapshot.archive_operation_id = v_operation.archive_operation_id
          AND snapshot.restore_status = 'pending'
        ORDER BY
            CASE snapshot.entity_type WHEN 'stop' THEN 1 ELSE 2 END,
            snapshot.entity_id
        FOR UPDATE
    LOOP
        v_current_row := NULL;

        IF v_snapshot.entity_type = 'stop' THEN
            SELECT pg_catalog.to_jsonb(stop_row)
            INTO v_current_row
            FROM public.stops AS stop_row
            WHERE stop_row.id = v_snapshot.entity_id
            FOR UPDATE;
        ELSE
            SELECT pg_catalog.to_jsonb(terminal_row)
            INTO v_current_row
            FROM public.terminals AS terminal_row
            WHERE terminal_row.id = v_snapshot.entity_id
            FOR UPDATE;
        END IF;

        IF NOT FOUND OR v_current_row IS NULL THEN
            RAISE EXCEPTION
                'A snapshotted location is missing. Recovery history cannot be finalized automatically.'
                USING ERRCODE = '40001';
        END IF;

        IF v_current_row IS DISTINCT FROM v_snapshot.original_row THEN
            RAISE EXCEPTION
                'A snapshotted location no longer exactly matches its original pre-archive row. Recovery history cannot be finalized automatically.'
                USING ERRCODE = '40001';
        END IF;

        v_location_count := v_location_count + 1;
    END LOOP;

    -- The data rows are already in their exact original state. Mark the
    -- snapshots and operation as reconciled to release the one-open-operation
    -- unique constraint and permit a future archive cycle.
    UPDATE route_management_internal.route_archive_location_snapshots AS snapshot
    SET
        restore_status = 'restored',
        restore_note = 'The current row already matched the exact original snapshot. Recovery tracking was reconciled without modifying the location.',
        restored_at = v_now
    WHERE snapshot.archive_operation_id = v_operation.archive_operation_id
      AND snapshot.restore_status = 'pending';

    UPDATE route_management_internal.route_archive_operations AS operation_row
    SET
        reinstated_by = v_actor,
        reinstated_at = v_now,
        reinstatement_result = pg_catalog.jsonb_build_object(
            'route_id', p_route_id,
            'reconciled', true,
            'records_changed', false,
            'location_snapshot_count', v_location_count,
            'completed_at', v_now
        )
    WHERE operation_row.archive_operation_id = v_operation.archive_operation_id
      AND operation_row.reinstated_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'The archive operation was already completed by another request.'
            USING ERRCODE = '40001';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'routeId', p_route_id,
        'archiveOperationId', v_operation.archive_operation_id,
        'status', 'reconciled',
        'recordsChanged', false,
        'locationSnapshotCount', v_location_count,
        'reconciledAt', v_now
    );
END;
$function$;

-- Public RPC exposure is limited to authenticated callers. The function itself
-- performs the strict admin role check before touching internal state.
REVOKE ALL ON FUNCTION public.get_route_archive_recovery_status()
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_route_archive_recovery_status()
    TO authenticated;

REVOKE ALL ON FUNCTION public.reinstate_archived_route(bigint)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reinstate_archived_route(bigint)
    TO authenticated;

REVOKE ALL ON FUNCTION public.reconcile_restored_route_archive(bigint)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_restored_route_archive(bigint)
    TO authenticated;

COMMIT;
