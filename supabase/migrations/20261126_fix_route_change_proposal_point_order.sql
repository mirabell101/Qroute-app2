BEGIN;

-- The established submit_route_change_proposal() RPC predates the
-- proposed_stop_order column and inserts proposal points without naming
-- that column. Since proposed_stop_order is NOT NULL, initialize it from
-- the canonical stop_order before the row is checked or stored.
-- The newer wrapper RPC will subsequently replace this initial value with
-- the contributor's requested order. Lifecycle conversions can still
-- update removed points to 0 together with is_removed_from_route = true.

CREATE OR REPLACE FUNCTION public.initialize_route_change_proposal_point_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NEW.proposed_stop_order IS NULL THEN
    NEW.proposed_stop_order := NEW.stop_order;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_initialize_route_change_proposal_point_order
  ON public.route_change_proposal_points;

CREATE TRIGGER trg_initialize_route_change_proposal_point_order
BEFORE INSERT ON public.route_change_proposal_points
FOR EACH ROW
EXECUTE FUNCTION public.initialize_route_change_proposal_point_order();

COMMIT;
