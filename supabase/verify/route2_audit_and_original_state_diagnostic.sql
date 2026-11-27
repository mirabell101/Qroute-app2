-- Read-only investigation of the open archive operation for Route #2 and Stop #5.
-- It compares the live records to BOTH sides of the captured operation and
-- returns audit log rows without assuming a particular timestamp column name.

SELECT
    operation.archive_operation_id,
    operation.route_id,
    pg_catalog.to_jsonb(route_row) = operation.route_before
        AS route_matches_original_snapshot,
    pg_catalog.to_jsonb(route_row) = operation.route_archived_after
        AS route_matches_archived_snapshot,
    (
        SELECT COALESCE(
            pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                    'entity_type', snapshot.entity_type,
                    'entity_id', snapshot.entity_id,
                    'matches_original_snapshot',
                        CASE
                            WHEN snapshot.entity_type = 'stop'
                                THEN pg_catalog.to_jsonb(stop_row) = snapshot.original_row
                            ELSE pg_catalog.to_jsonb(terminal_row) = snapshot.original_row
                        END,
                    'matches_archived_snapshot',
                        CASE
                            WHEN snapshot.entity_type = 'stop'
                                THEN pg_catalog.to_jsonb(stop_row) = snapshot.archived_row
                            ELSE pg_catalog.to_jsonb(terminal_row) = snapshot.archived_row
                        END
                )
                ORDER BY snapshot.entity_type, snapshot.entity_id
            ),
            '[]'::jsonb
        )
        FROM route_management_internal.route_archive_location_snapshots AS snapshot
        LEFT JOIN public.stops AS stop_row
            ON snapshot.entity_type = 'stop'
           AND stop_row.id = snapshot.entity_id
        LEFT JOIN public.terminals AS terminal_row
            ON snapshot.entity_type = 'terminal'
           AND terminal_row.id = snapshot.entity_id
        WHERE snapshot.archive_operation_id = operation.archive_operation_id
    ) AS location_comparisons
FROM route_management_internal.route_archive_operations AS operation
JOIN public.routes AS route_row
  ON route_row.id = operation.route_id
WHERE operation.route_id = 2
  AND operation.reinstated_at IS NULL;

-- Audit events for route #2 and stop #5. The entire row is returned as JSONB
-- so this remains usable even if optional audit columns differ by migration.
SELECT pg_catalog.to_jsonb(audit_row) AS audit_event
FROM public.admin_audit_logs AS audit_row
WHERE pg_catalog.to_jsonb(audit_row) ->> 'target_type' IN ('route', 'stop')
  AND pg_catalog.to_jsonb(audit_row) ->> 'target_id' IN ('2', '5')
ORDER BY COALESCE(
    pg_catalog.to_jsonb(audit_row) ->> 'created_at',
    pg_catalog.to_jsonb(audit_row) ->> 'occurred_at',
    pg_catalog.to_jsonb(audit_row) ->> 'inserted_at'
) DESC NULLS LAST
LIMIT 30;
