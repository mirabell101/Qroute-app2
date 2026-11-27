-- QRoute rollback preflight (corrected, safe when reused_existing_point is absent).
-- READ ONLY: this query does not modify proposals, locations, functions, or schema.
-- Run it before the rollback and inspect all returned columns.
--
-- A pending proposal is flagged for review if either:
--   1. its reuse marker is true (when the marker column exists); OR
--   2. a point marked is_new_point=true already references an approved stop/terminal.
-- The second check detects reused rows even if the marker column was removed.

WITH schema_state AS (
    SELECT
        EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'route_change_proposal_points'
              AND column_name = 'reused_existing_point'
        ) AS reuse_column_exists,
        to_regprocedure(
            'public.reuse_inactive_route_conversion_location(bigint,integer,integer,uuid)'
        ) IS NOT NULL AS reuse_helper_exists,
        to_regprocedure(
            'public.submit_route_change_proposal_with_lifecycle_edits(bigint,text,jsonb)'
        ) IS NOT NULL AS submit_function_exists,
        to_regprocedure(
            'public.moderate_route_change_proposal(bigint,text,text)'
        ) IS NOT NULL AS moderation_function_exists,
        CASE
            WHEN to_regprocedure(
                'public.submit_route_change_proposal_with_lifecycle_edits(bigint,text,jsonb)'
            ) IS NULL THEN FALSE
            ELSE pg_catalog.strpos(
                pg_catalog.pg_get_functiondef(
                    to_regprocedure(
                        'public.submit_route_change_proposal_with_lifecycle_edits(bigint,text,jsonb)'
                    )::oid
                ),
                'reuse_inactive_route_conversion_location'
            ) > 0
        END AS submit_calls_reuse_helper,
        CASE
            WHEN to_regprocedure(
                'public.reuse_inactive_route_conversion_location(bigint,integer,integer,uuid)'
            ) IS NULL THEN FALSE
            ELSE pg_catalog.strpos(
                pg_catalog.pg_get_functiondef(
                    to_regprocedure(
                        'public.reuse_inactive_route_conversion_location(bigint,integer,integer,uuid)'
                    )::oid
                ),
                'reused_existing_point'
            ) > 0
        END AS helper_references_reuse_marker,
        CASE
            WHEN to_regprocedure(
                'public.moderate_route_change_proposal(bigint,text,text)'
            ) IS NULL THEN FALSE
            ELSE pg_catalog.strpos(
                pg_catalog.pg_get_functiondef(
                    to_regprocedure(
                        'public.moderate_route_change_proposal(bigint,text,text)'
                    )::oid
                ),
                'reused_existing_point'
            ) > 0
        END AS moderation_references_reuse_marker,
        to_regprocedure(
            'public.apply_route_change_proposal_edits()'
        ) IS NOT NULL AS apply_trigger_function_exists,
        CASE
            WHEN to_regprocedure(
                'public.apply_route_change_proposal_edits()'
            ) IS NULL THEN FALSE
            ELSE pg_catalog.strpos(
                pg_catalog.lower(
                    pg_catalog.pg_get_functiondef(
                        to_regprocedure(
                            'public.apply_route_change_proposal_edits()'
                        )::oid
                    )
                ),
                'set is_active = false'
            ) > 0
        END AS apply_function_deactivates_converted_rows
), pending_points AS (
    SELECT
        proposal.id AS proposal_id,
        proposal.route_id,
        proposal.proposal_type,
        proposal.created_at,
        proposal_point.stop_order,
        proposal_point.stop_id,
        proposal_point.terminal_id,
        (pg_catalog.to_jsonb(proposal_point) ->> 'reused_existing_point') AS reuse_marker,
        (
            proposal_point.stop_id IS NOT NULL
            AND stop_row.is_approved IS TRUE
            AND stop_row.moderation_status = 'approved'
        ) AS points_to_approved_stop,
        (
            proposal_point.terminal_id IS NOT NULL
            AND terminal_row.is_approved IS TRUE
            AND terminal_row.moderation_status = 'approved'
        ) AS points_to_approved_terminal
    FROM public.route_change_proposals AS proposal
    JOIN public.route_change_proposal_points AS proposal_point
        ON proposal_point.proposal_id = proposal.id
    LEFT JOIN public.stops AS stop_row
        ON stop_row.id = proposal_point.stop_id
    LEFT JOIN public.terminals AS terminal_row
        ON terminal_row.id = proposal_point.terminal_id
    WHERE proposal.status = 'pending'
      AND proposal_point.is_new_point IS TRUE
), needs_review AS (
    SELECT *
    FROM pending_points
    WHERE reuse_marker = 'true'
       OR points_to_approved_stop IS TRUE
       OR points_to_approved_terminal IS TRUE
)
SELECT
    schema_state.reuse_column_exists,
    schema_state.reuse_helper_exists,
    schema_state.submit_function_exists,
    schema_state.moderation_function_exists,
    schema_state.submit_calls_reuse_helper,
    schema_state.helper_references_reuse_marker,
    schema_state.moderation_references_reuse_marker,
    schema_state.apply_trigger_function_exists,
    schema_state.apply_function_deactivates_converted_rows,
    COUNT(DISTINCT needs_review.proposal_id) AS pending_proposals_needing_review,
    COALESCE(
        pg_catalog.jsonb_agg(
            DISTINCT pg_catalog.jsonb_build_object(
                'proposal_id', needs_review.proposal_id,
                'route_id', needs_review.route_id,
                'proposal_type', needs_review.proposal_type,
                'created_at', needs_review.created_at,
                'stop_order', needs_review.stop_order,
                'location', CASE
                    WHEN needs_review.terminal_id IS NOT NULL
                        THEN 'terminal:' || needs_review.terminal_id::text
                    WHEN needs_review.stop_id IS NOT NULL
                        THEN 'stop:' || needs_review.stop_id::text
                    ELSE NULL
                END,
                'reuse_marker', needs_review.reuse_marker,
                'approved_stop_reference', needs_review.points_to_approved_stop,
                'approved_terminal_reference', needs_review.points_to_approved_terminal
            )
        ) FILTER (WHERE needs_review.proposal_id IS NOT NULL),
        '[]'::jsonb
    ) AS pending_proposals_to_review
FROM schema_state
LEFT JOIN needs_review
    ON TRUE
GROUP BY
    schema_state.reuse_column_exists,
    schema_state.reuse_helper_exists,
    schema_state.submit_function_exists,
    schema_state.moderation_function_exists,
    schema_state.submit_calls_reuse_helper,
    schema_state.helper_references_reuse_marker,
    schema_state.moderation_references_reuse_marker,
    schema_state.apply_trigger_function_exists,
    schema_state.apply_function_deactivates_converted_rows;
