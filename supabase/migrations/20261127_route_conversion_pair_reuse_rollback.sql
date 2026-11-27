BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(913713, 42001);

DROP TRIGGER IF EXISTS zzzz_finalize_route_change_conversion_pairs
  ON public.route_change_proposals;

DROP FUNCTION IF EXISTS public.finalize_route_change_conversion_pairs();

-- Intentionally retain public.route_conversion_pairs and
-- route_change_proposal_points.reused_existing_point. They contain durable
-- identity/audit information and are safe but inactive without the trigger.
-- Do not drop them automatically: doing so after conversions have reused
-- records would discard the pairing history needed for a later re-enable.

COMMIT;

-- Optional destructive cleanup, ONLY if the feature has never been used and
-- you explicitly want to remove its stored schema/data as well:
-- ALTER TABLE public.route_change_proposal_points
--   DROP COLUMN IF EXISTS reused_existing_point;
-- DROP TABLE IF EXISTS public.route_conversion_pairs;
