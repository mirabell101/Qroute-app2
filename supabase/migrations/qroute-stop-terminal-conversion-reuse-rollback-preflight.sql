-- QRoute rollback preflight: identify pending proposals that reference reused rows.
-- Run before the rollback. If this returns any rows, do not apply the rollback yet.

SELECT
    proposal.id AS proposal_id,
    proposal.route_id,
    proposal.proposal_type,
    proposal.status,
    proposal.created_at,
    COUNT(*) FILTER (
        WHERE proposal_point.reused_existing_point IS TRUE
    ) AS reused_point_count,
    ARRAY_AGG(
        DISTINCT CASE
            WHEN proposal_point.terminal_id IS NOT NULL
                THEN 'terminal:' || proposal_point.terminal_id::text
            ELSE 'stop:' || proposal_point.stop_id::text
        END
    ) FILTER (
        WHERE proposal_point.reused_existing_point IS TRUE
    ) AS reused_location_ids
FROM public.route_change_proposals AS proposal
JOIN public.route_change_proposal_points AS proposal_point
    ON proposal_point.proposal_id = proposal.id
WHERE proposal.status = 'pending'
  AND proposal_point.reused_existing_point IS TRUE
GROUP BY
    proposal.id,
    proposal.route_id,
    proposal.proposal_type,
    proposal.status,
    proposal.created_at
ORDER BY proposal.created_at;
