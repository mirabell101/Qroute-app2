-- Run after applying 20261127_public_map_visibility_status.sql.
-- Every invalid_status_count must be zero.

WITH payload AS MATERIALIZED (
    SELECT public.get_public_map_data() AS data
),
checks AS (
    SELECT
        'terminals'::text AS section,
        COUNT(*)::bigint AS record_count,
        COUNT(*) FILTER (
            WHERE item->>'is_active' IS DISTINCT FROM 'true'
               OR item->>'is_deleted' IS DISTINCT FROM 'false'
        )::bigint AS invalid_status_count
    FROM payload
    CROSS JOIN LATERAL jsonb_array_elements(payload.data->'terminals') AS e(item)

    UNION ALL

    SELECT
        'stops',
        COUNT(*)::bigint,
        COUNT(*) FILTER (
            WHERE item->>'is_active' IS DISTINCT FROM 'true'
               OR item->>'is_deleted' IS DISTINCT FROM 'false'
        )::bigint
    FROM payload
    CROSS JOIN LATERAL jsonb_array_elements(payload.data->'stops') AS e(item)

    UNION ALL

    SELECT
        'routes',
        COUNT(*)::bigint,
        COUNT(*) FILTER (
            WHERE item->>'is_active' IS DISTINCT FROM 'true'
               OR item->>'is_deleted' IS DISTINCT FROM 'false'
        )::bigint
    FROM payload
    CROSS JOIN LATERAL jsonb_array_elements(payload.data->'routes') AS e(item)

    UNION ALL

    SELECT
        'route_stops.terminals',
        COUNT(*)::bigint,
        COUNT(*) FILTER (
            WHERE terminal->>'is_active' IS DISTINCT FROM 'true'
               OR terminal->>'is_deleted' IS DISTINCT FROM 'false'
        )::bigint
    FROM payload
    CROSS JOIN LATERAL jsonb_array_elements(payload.data->'routes') AS r(route)
    CROSS JOIN LATERAL jsonb_array_elements(r.route->'route_stops') AS rs(point)
    CROSS JOIN LATERAL (SELECT rs.point->'terminals' AS terminal) AS nested
    WHERE jsonb_typeof(nested.terminal) = 'object'

    UNION ALL

    SELECT
        'route_stops.stops',
        COUNT(*)::bigint,
        COUNT(*) FILTER (
            WHERE stop->>'is_active' IS DISTINCT FROM 'true'
               OR stop->>'is_deleted' IS DISTINCT FROM 'false'
        )::bigint
    FROM payload
    CROSS JOIN LATERAL jsonb_array_elements(payload.data->'routes') AS r(route)
    CROSS JOIN LATERAL jsonb_array_elements(r.route->'route_stops') AS rs(point)
    CROSS JOIN LATERAL (SELECT rs.point->'stops' AS stop) AS nested
    WHERE jsonb_typeof(nested.stop) = 'object'
)
SELECT section, record_count, invalid_status_count
FROM checks
ORDER BY section;

-- Inspect the returned is_deleted fields directly if needed:
-- SELECT public.get_public_map_data()->'terminals';
-- SELECT public.get_public_map_data()->'routes';
