BEGIN;

-- ============================================================
-- 1. STORE ROUTE-SPECIFIC TERMINAL-TO-STOP REPLACEMENTS.
--
-- A terminal is a shared entity and must not be globally converted
-- into a stop. The proposal instead creates a new pending stop and
-- marks the old terminal association for removal from THIS route.
-- Other routes continue to use the original terminal unchanged.
-- ============================================================

ALTER TABLE public.route_change_proposal_points
  ADD COLUMN IF NOT EXISTS is_removed_from_route boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaces_stop_order integer;

-- A removed canonical point keeps its original stop_order for the
-- legacy route snapshot/moderation checks, but uses proposed order 0
-- so it is excluded from the final active sequence.
ALTER TABLE public.route_change_proposal_points
  DROP CONSTRAINT IF EXISTS route_change_proposal_points_proposed_order_check;

ALTER TABLE public.route_change_proposal_points
  ADD CONSTRAINT route_change_proposal_points_proposed_order_check
  CHECK (
    (is_removed_from_route IS TRUE AND proposed_stop_order = 0)
    OR (is_removed_from_route IS FALSE AND proposed_stop_order > 0)
  );

ALTER TABLE public.route_change_proposal_points
  DROP CONSTRAINT IF EXISTS route_change_proposal_points_replaces_stop_order_check;

ALTER TABLE public.route_change_proposal_points
  ADD CONSTRAINT route_change_proposal_points_replaces_stop_order_check
  CHECK (
    replaces_stop_order IS NULL
    OR (replaces_stop_order > 0 AND is_new_point IS TRUE)
  );

-- The earlier full unique index must become partial because removed
-- points share the sentinel order 0 and are no longer in the route.
DROP INDEX IF EXISTS public.uq_route_change_proposal_points_proposed_order;

CREATE UNIQUE INDEX uq_route_change_proposal_points_proposed_order
  ON public.route_change_proposal_points (proposal_id, proposed_stop_order)
  WHERE proposed_stop_order > 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_route_change_proposal_points_replacement
  ON public.route_change_proposal_points (proposal_id, replaces_stop_order)
  WHERE replaces_stop_order IS NOT NULL;

-- A contributor's explanation belongs to the proposal itself, not to
-- the route or any shared stop/terminal record.
ALTER TABLE public.route_change_proposals
  ADD COLUMN IF NOT EXISTS contributor_remarks text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.route_change_proposals'::regclass
      AND constraint_row.conname = 'route_change_proposals_contributor_remarks_check'
  ) THEN
    ALTER TABLE public.route_change_proposals
      ADD CONSTRAINT route_change_proposals_contributor_remarks_check
      CHECK (
        contributor_remarks IS NULL
        OR pg_catalog.char_length(pg_catalog.btrim(contributor_remarks)) <= 1000
      );
  END IF;
END;
$migration$;

-- ============================================================
-- 2. FIX ORDER-PERMUTATION COLLISIONS IN THE EXISTING WRAPPER.
--
-- The previous wrapper updated proposed_stop_order one point at a time.
-- A swap (for example, 2 <-> 3) could hit the unique proposal/order
-- index while the other point still occupied its old value. This version
-- first moves every proposal point to a temporary range, then writes the
-- final order. The canonical stop_order and legacy moderation checks stay
-- unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_route_change_proposal_with_edits(
  p_route_id bigint,
  p_proposal_type text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_payload_for_existing_rpc jsonb;
  v_point_edits jsonb;
  v_edit jsonb;
  v_result jsonb;
  v_proposal_id bigint;
  v_stop_order integer;
  v_proposed_stop_order integer;
  v_proposed_name text;
  v_original_name text;
  v_proposed_latitude double precision;
  v_proposed_longitude double precision;
  v_original_latitude double precision;
  v_original_longitude double precision;
  v_is_new_point boolean;
  v_point_count integer;
  v_updated_count integer;
  v_seen_orders integer[] := ARRAY[]::integer[];
  v_seen_proposed_orders integer[] := ARRAY[]::integer[];
  v_has_latitude boolean;
  v_has_longitude boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'A valid proposal payload is required.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_payload) AS payload_key(key)
    WHERE payload_key.key NOT IN ('proposed_name', 'points', 'point_edits')
  ) THEN
    RAISE EXCEPTION 'The proposal payload contains unsupported fields.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_payload -> 'points') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_payload -> 'point_edits') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'The complete canonical route sequence and point edits are required.'
      USING ERRCODE = '22023';
  END IF;

  v_point_edits := p_payload -> 'point_edits';

  v_payload_for_existing_rpc := pg_catalog.jsonb_build_object(
    'points', p_payload -> 'points'
  );
  IF p_payload ? 'proposed_name' THEN
    v_payload_for_existing_rpc := v_payload_for_existing_rpc
      || pg_catalog.jsonb_build_object('proposed_name', p_payload -> 'proposed_name');
  END IF;

  v_result := public.submit_route_change_proposal(
    p_route_id,
    p_proposal_type,
    v_payload_for_existing_rpc
  );

  v_proposal_id := (v_result ->> 'proposal_id')::bigint;

  SELECT pg_catalog.count(*)::integer
  INTO v_point_count
  FROM public.route_change_proposal_points AS proposal_point
  WHERE proposal_point.proposal_id = v_proposal_id;

  IF v_point_count < 2
     OR pg_catalog.jsonb_array_length(v_point_edits) <> v_point_count
  THEN
    RAISE EXCEPTION 'Every proposed route point must have exactly one final sequence position.'
      USING ERRCODE = '22023';
  END IF;

  -- Pass one: validate the entire edit map before changing any proposal
  -- point. This also prevents partial writes if a later edit is invalid.
  FOR v_edit IN
    SELECT edit_value
    FROM pg_catalog.jsonb_array_elements(v_point_edits) AS edit_row(edit_value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_edit) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every point edit must be an object.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_edit) AS edit_key(key)
      WHERE edit_key.key NOT IN (
        'stop_order', 'proposed_stop_order', 'proposed_name', 'latitude', 'longitude'
      )
    ) THEN
      RAISE EXCEPTION 'A point edit contains unsupported fields.'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_edit -> 'stop_order') IS DISTINCT FROM 'number'
       OR (v_edit ->> 'stop_order') !~ '^[1-9][0-9]*$'
       OR pg_catalog.jsonb_typeof(v_edit -> 'proposed_stop_order') IS DISTINCT FROM 'number'
       OR (v_edit ->> 'proposed_stop_order') !~ '^[1-9][0-9]*$'
    THEN
      RAISE EXCEPTION 'Every point edit needs valid canonical and proposed sequence positions.'
        USING ERRCODE = '22023';
    END IF;

    v_stop_order := (v_edit ->> 'stop_order')::integer;
    v_proposed_stop_order := (v_edit ->> 'proposed_stop_order')::integer;

    IF v_stop_order > v_point_count OR v_proposed_stop_order > v_point_count THEN
      RAISE EXCEPTION 'A route point sequence position is outside the proposal.'
        USING ERRCODE = '22023';
    END IF;

    IF v_stop_order = ANY(v_seen_orders) THEN
      RAISE EXCEPTION 'A route point can only have one canonical sequence mapping.'
        USING ERRCODE = '22023';
    END IF;
    IF v_proposed_stop_order = ANY(v_seen_proposed_orders) THEN
      RAISE EXCEPTION 'Two route points cannot occupy the same proposed sequence position.'
        USING ERRCODE = '22023';
    END IF;

    v_seen_orders := pg_catalog.array_append(v_seen_orders, v_stop_order);
    v_seen_proposed_orders := pg_catalog.array_append(v_seen_proposed_orders, v_proposed_stop_order);

    v_has_latitude := v_edit ? 'latitude';
    v_has_longitude := v_edit ? 'longitude';
    IF v_has_latitude IS DISTINCT FROM v_has_longitude THEN
      RAISE EXCEPTION 'Both latitude and longitude are required for a location move.'
        USING ERRCODE = '22023';
    END IF;

    SELECT proposal_point.is_new_point
    INTO v_is_new_point
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = v_proposal_id
      AND proposal_point.stop_order = v_stop_order;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A point edit does not match a location in the canonical proposal sequence.'
        USING ERRCODE = '22023';
    END IF;

    v_proposed_name := NULL;
    IF v_edit ? 'proposed_name' THEN
      IF pg_catalog.jsonb_typeof(v_edit -> 'proposed_name') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'A proposed point name must be text.'
          USING ERRCODE = '22023';
      END IF;
      v_proposed_name := pg_catalog.btrim(v_edit ->> 'proposed_name');
      IF v_proposed_name = '' OR pg_catalog.char_length(v_proposed_name) > 120 THEN
        RAISE EXCEPTION 'A proposed point name must contain 1 to 120 characters.'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_has_latitude THEN
      IF pg_catalog.jsonb_typeof(v_edit -> 'latitude') IS DISTINCT FROM 'number'
         OR pg_catalog.jsonb_typeof(v_edit -> 'longitude') IS DISTINCT FROM 'number'
      THEN
        RAISE EXCEPTION 'Proposed coordinates must be numeric.'
          USING ERRCODE = '22023';
      END IF;

      v_proposed_latitude := (v_edit ->> 'latitude')::double precision;
      v_proposed_longitude := (v_edit ->> 'longitude')::double precision;

      IF v_proposed_latitude NOT BETWEEN -90 AND 90
         OR v_proposed_longitude NOT BETWEEN -180 AND 180
      THEN
        RAISE EXCEPTION 'Proposed coordinates are outside valid latitude/longitude ranges.'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_is_new_point IS TRUE AND (v_proposed_name IS NOT NULL OR v_has_latitude) THEN
      RAISE EXCEPTION 'New points already carry their proposed name and coordinates.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF pg_catalog.cardinality(v_seen_orders) <> v_point_count
     OR pg_catalog.cardinality(v_seen_proposed_orders) <> v_point_count
  THEN
    RAISE EXCEPTION 'The proposed sequence mapping is incomplete.'
      USING ERRCODE = '22023';
  END IF;

  -- Stage all positions above the current 1..N range. The final order is
  -- then safe to write one row at a time, including swaps and longer cycles.
  UPDATE public.route_change_proposal_points AS proposal_point
  SET proposed_stop_order = proposal_point.stop_order + v_point_count
  WHERE proposal_point.proposal_id = v_proposal_id;

  -- Pass two: persist validated edits and final order values.
  FOR v_edit IN
    SELECT edit_value
    FROM pg_catalog.jsonb_array_elements(v_point_edits) AS edit_row(edit_value)
  LOOP
    v_stop_order := (v_edit ->> 'stop_order')::integer;
    v_proposed_stop_order := (v_edit ->> 'proposed_stop_order')::integer;
    v_has_latitude := v_edit ? 'latitude';

    v_proposed_name := NULL;
    IF v_edit ? 'proposed_name' THEN
      v_proposed_name := pg_catalog.btrim(v_edit ->> 'proposed_name');
    END IF;

    v_proposed_latitude := NULL;
    v_proposed_longitude := NULL;
    IF v_has_latitude THEN
      v_proposed_latitude := (v_edit ->> 'latitude')::double precision;
      v_proposed_longitude := (v_edit ->> 'longitude')::double precision;
    END IF;

    SELECT
      proposal_point.is_new_point,
      CASE
        WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.name
        ELSE stop_row.name
      END,
      CASE
        WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.latitude
        ELSE stop_row.latitude
      END,
      CASE
        WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.longitude
        ELSE stop_row.longitude
      END
    INTO
      v_is_new_point,
      v_original_name,
      v_original_latitude,
      v_original_longitude
    FROM public.route_change_proposal_points AS proposal_point
    LEFT JOIN public.terminals AS terminal_row
      ON terminal_row.id = proposal_point.terminal_id
    LEFT JOIN public.stops AS stop_row
      ON stop_row.id = proposal_point.stop_id
    WHERE proposal_point.proposal_id = v_proposal_id
      AND proposal_point.stop_order = v_stop_order;

    IF v_is_new_point IS TRUE THEN
      UPDATE public.route_change_proposal_points AS proposal_point
      SET proposed_stop_order = v_proposed_stop_order
      WHERE proposal_point.proposal_id = v_proposal_id
        AND proposal_point.stop_order = v_stop_order;
    ELSE
      UPDATE public.route_change_proposal_points AS proposal_point
      SET
        proposed_stop_order = v_proposed_stop_order,
        proposed_name = v_proposed_name,
        original_name = CASE
          WHEN v_proposed_name IS NOT NULL THEN v_original_name
          ELSE NULL
        END,
        proposed_latitude = CASE
          WHEN v_has_latitude
            AND (v_proposed_latitude, v_proposed_longitude)
                IS DISTINCT FROM (v_original_latitude, v_original_longitude)
          THEN v_proposed_latitude
          ELSE NULL
        END,
        proposed_longitude = CASE
          WHEN v_has_latitude
            AND (v_proposed_latitude, v_proposed_longitude)
                IS DISTINCT FROM (v_original_latitude, v_original_longitude)
          THEN v_proposed_longitude
          ELSE NULL
        END,
        original_latitude = CASE
          WHEN v_has_latitude
            AND (v_proposed_latitude, v_proposed_longitude)
                IS DISTINCT FROM (v_original_latitude, v_original_longitude)
          THEN v_original_latitude
          ELSE NULL
        END,
        original_longitude = CASE
          WHEN v_has_latitude
            AND (v_proposed_latitude, v_proposed_longitude)
                IS DISTINCT FROM (v_original_latitude, v_original_longitude)
          THEN v_original_longitude
          ELSE NULL
        END
      WHERE proposal_point.proposal_id = v_proposal_id
        AND proposal_point.stop_order = v_stop_order;
    END IF;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'Unable to store a proposed route-point edit.'
        USING ERRCODE = '40001';
    END IF;
  END LOOP;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_route_change_proposal_with_edits(bigint, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_change_proposal_with_edits(bigint, text, jsonb)
  TO authenticated;

-- ============================================================
-- 3. ADD THE LIFECYCLE-AWARE WRAPPER WITHOUT CHANGING THE
--    EXISTING MODERATION RPC OR ITS CANONICAL ROUTE SNAPSHOT.
--
-- The previous wrapper still validates and creates all canonical
-- points. This wrapper strips lifecycle-only fields before calling it,
-- then applies removal/replacement metadata to the pending proposal.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_route_change_proposal_with_lifecycle_edits(
  p_route_id bigint,
  p_proposal_type text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_clean_payload jsonb;
  v_clean_point_edits jsonb;
  v_point_edits jsonb;
  v_edit jsonb;
  v_result jsonb;
  v_proposal_id bigint;
  v_stop_order integer;
  v_replaces_stop_order integer;
  v_is_removed boolean;
  v_is_new_point boolean;
  v_terminal_id bigint;
  v_stop_id bigint;
  v_old_terminal_transport_type_id bigint;
  v_new_stop_transport_type_id bigint;
  v_new_stop_type text;
  v_remarks text;
  v_point_count integer;
  v_removed_count integer := 0;
  v_replacement_count integer := 0;
  v_active_count integer;
  v_active_distinct_orders integer;
  v_active_min_order integer;
  v_active_max_order integer;
  v_updated_count integer;
  v_removed_orders integer[] := ARRAY[]::integer[];
  v_replacement_targets integer[] := ARRAY[]::integer[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'A valid route-change proposal payload is required.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_payload) AS payload_key(key)
    WHERE payload_key.key NOT IN (
      'proposed_name',
      'points',
      'point_edits',
      'contributor_remarks'
    )
  ) THEN
    RAISE EXCEPTION 'The route-change proposal contains unsupported fields.'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_payload -> 'points') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_payload -> 'point_edits') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'The complete route sequence and point edits are required.'
      USING ERRCODE = '22023';
  END IF;

  v_point_edits := p_payload -> 'point_edits';
  IF p_payload ? 'contributor_remarks'
     AND pg_catalog.jsonb_typeof(p_payload -> 'contributor_remarks') NOT IN ('string', 'null')
  THEN
    RAISE EXCEPTION 'Contributor remarks must be text or null.'
      USING ERRCODE = '22023';
  END IF;

  v_remarks := NULLIF(pg_catalog.btrim(COALESCE(p_payload ->> 'contributor_remarks', '')), '');
  IF v_remarks IS NOT NULL AND pg_catalog.char_length(v_remarks) > 1000 THEN
    RAISE EXCEPTION 'Contributor remarks cannot exceed 1,000 characters.'
      USING ERRCODE = '22023';
  END IF;

  -- The existing coordinate/order wrapper knows only the canonical and
  -- proposed sequence fields, names, and coordinates. Strip the lifecycle
  -- fields before delegating, while preserving JSON array order.
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      edit_row.edit_value - 'remove_from_route' - 'replaces_stop_order'
      ORDER BY edit_row.ordinality
    ),
    '[]'::pg_catalog.jsonb
  )
  INTO v_clean_point_edits
  FROM pg_catalog.jsonb_array_elements(v_point_edits)
    WITH ORDINALITY AS edit_row(edit_value, ordinality);

  v_clean_payload := pg_catalog.jsonb_build_object(
    'points', p_payload -> 'points',
    'point_edits', v_clean_point_edits
  );

  IF p_payload ? 'proposed_name' THEN
    v_clean_payload := v_clean_payload
      || pg_catalog.jsonb_build_object('proposed_name', p_payload -> 'proposed_name');
  END IF;

  v_result := public.submit_route_change_proposal_with_edits(
    p_route_id,
    p_proposal_type,
    v_clean_payload
  );

  v_proposal_id := (v_result ->> 'proposal_id')::bigint;

  SELECT pg_catalog.count(*)::integer
  INTO v_point_count
  FROM public.route_change_proposal_points AS proposal_point
  WHERE proposal_point.proposal_id = v_proposal_id;

  IF v_point_count < 2
     OR pg_catalog.jsonb_array_length(v_point_edits) <> v_point_count
  THEN
    RAISE EXCEPTION 'Every canonical route point must have exactly one lifecycle edit.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_edit IN
    SELECT edit_value
    FROM pg_catalog.jsonb_array_elements(v_point_edits) AS edit_row(edit_value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_edit) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Every point lifecycle edit must be an object.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(v_edit) AS edit_key(key)
      WHERE edit_key.key NOT IN (
        'stop_order',
        'proposed_stop_order',
        'proposed_name',
        'latitude',
        'longitude',
        'remove_from_route',
        'replaces_stop_order'
      )
    ) THEN
      RAISE EXCEPTION 'A point lifecycle edit contains unsupported fields.'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_edit -> 'stop_order') IS DISTINCT FROM 'number'
       OR (v_edit ->> 'stop_order') !~ '^[1-9][0-9]*$'
    THEN
      RAISE EXCEPTION 'A point lifecycle edit needs a canonical sequence number.'
        USING ERRCODE = '22023';
    END IF;

    v_stop_order := (v_edit ->> 'stop_order')::integer;
    v_is_removed := false;
    IF v_edit ? 'remove_from_route' THEN
      IF pg_catalog.jsonb_typeof(v_edit -> 'remove_from_route') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'remove_from_route must be a boolean.'
          USING ERRCODE = '22023';
      END IF;
      v_is_removed := (v_edit ->> 'remove_from_route')::boolean;
    END IF;

    v_replaces_stop_order := NULL;
    IF v_edit ? 'replaces_stop_order' THEN
      IF pg_catalog.jsonb_typeof(v_edit -> 'replaces_stop_order') IS DISTINCT FROM 'number'
         OR (v_edit ->> 'replaces_stop_order') !~ '^[1-9][0-9]*$'
      THEN
        RAISE EXCEPTION 'replaces_stop_order must be a positive sequence number.'
          USING ERRCODE = '22023';
      END IF;
      v_replaces_stop_order := (v_edit ->> 'replaces_stop_order')::integer;
    END IF;

    SELECT
      proposal_point.is_new_point,
      proposal_point.terminal_id,
      proposal_point.stop_id
    INTO
      v_is_new_point,
      v_terminal_id,
      v_stop_id
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = v_proposal_id
      AND proposal_point.stop_order = v_stop_order;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A lifecycle edit does not match a canonical proposal point.'
        USING ERRCODE = '22023';
    END IF;

    IF v_is_removed THEN
      IF v_is_new_point IS TRUE
         OR v_terminal_id IS NULL
         OR v_stop_id IS NOT NULL
         OR v_stop_order = 1
         OR v_edit ? 'proposed_name'
         OR v_edit ? 'latitude'
         OR v_edit ? 'longitude'
      THEN
        RAISE EXCEPTION
          'Only an existing non-start terminal can be removed from this route as part of a terminal-to-stop replacement.'
          USING ERRCODE = '22023';
      END IF;

      v_removed_orders := pg_catalog.array_append(v_removed_orders, v_stop_order);
      v_removed_count := v_removed_count + 1;

      UPDATE public.route_change_proposal_points AS proposal_point
      SET
        is_removed_from_route = true,
        proposed_stop_order = 0
      WHERE proposal_point.proposal_id = v_proposal_id
        AND proposal_point.stop_order = v_stop_order
        AND proposal_point.is_new_point IS FALSE
        AND proposal_point.terminal_id IS NOT NULL;

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'Unable to mark the original terminal for route-specific replacement.'
          USING ERRCODE = '40001';
      END IF;
    END IF;

    IF v_replaces_stop_order IS NOT NULL THEN
      IF v_is_new_point IS NOT TRUE OR v_stop_id IS NULL OR v_terminal_id IS NOT NULL THEN
        RAISE EXCEPTION 'Only a newly proposed stop can replace an existing terminal.'
          USING ERRCODE = '22023';
      END IF;

      IF v_replaces_stop_order = ANY(v_replacement_targets) THEN
        RAISE EXCEPTION 'An original terminal can only be replaced once in a proposal.'
          USING ERRCODE = '22023';
      END IF;
      v_replacement_targets := pg_catalog.array_append(v_replacement_targets, v_replaces_stop_order);
      v_replacement_count := v_replacement_count + 1;

      SELECT
        original_terminal.transport_type_id,
        replacement_stop.transport_type_id,
        replacement_stop.stop_type
      INTO
        v_old_terminal_transport_type_id,
        v_new_stop_transport_type_id,
        v_new_stop_type
      FROM public.route_change_proposal_points AS removed_point
      JOIN public.terminals AS original_terminal
        ON original_terminal.id = removed_point.terminal_id
      JOIN public.stops AS replacement_stop
        ON replacement_stop.id = v_stop_id
      JOIN public.routes AS route_row
        ON route_row.id = p_route_id
      JOIN public.transport_variants AS route_variant
        ON route_variant.id = route_row.variant_id
      WHERE removed_point.proposal_id = v_proposal_id
        AND removed_point.stop_order = v_replaces_stop_order
        AND removed_point.is_new_point IS FALSE
        AND removed_point.terminal_id IS NOT NULL
        AND removed_point.stop_id IS NULL
        AND route_variant.fare_model = 'distance'
        AND route_row.transport_type_id = original_terminal.transport_type_id
        AND route_row.transport_type_id = replacement_stop.transport_type_id
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements(v_point_edits) AS raw_edit(edit_value)
          WHERE (raw_edit.edit_value ->> 'stop_order') ~ '^[1-9][0-9]*$'
            AND (raw_edit.edit_value ->> 'stop_order')::integer = v_replaces_stop_order
            AND pg_catalog.jsonb_typeof(raw_edit.edit_value -> 'remove_from_route') = 'boolean'
            AND (raw_edit.edit_value ->> 'remove_from_route')::boolean IS TRUE
        );

      IF NOT FOUND
         OR v_old_terminal_transport_type_id IS DISTINCT FROM v_new_stop_transport_type_id
         OR v_new_stop_type IS DISTINCT FROM 'road_stop'
      THEN
        RAISE EXCEPTION
          'A terminal can only be replaced by a newly proposed road stop for the same vehicle type.'
          USING ERRCODE = '22023';
      END IF;

      UPDATE public.route_change_proposal_points AS proposal_point
      SET replaces_stop_order = v_replaces_stop_order
      WHERE proposal_point.proposal_id = v_proposal_id
        AND proposal_point.stop_order = v_stop_order
        AND proposal_point.is_new_point IS TRUE
        AND proposal_point.stop_id = v_stop_id;

      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
      IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'Unable to link the proposed stop to the terminal it replaces.'
          USING ERRCODE = '40001';
      END IF;
    END IF;
  END LOOP;

  IF v_removed_count <> v_replacement_count THEN
    RAISE EXCEPTION 'Every terminal removed from this route must have exactly one proposed stop replacement.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT removed_order
    FROM pg_catalog.unnest(v_removed_orders) AS removed(removed_order)
    EXCEPT
    SELECT replacement_order
    FROM pg_catalog.unnest(v_replacement_targets) AS replacement(replacement_order)
  ) OR EXISTS (
    SELECT replacement_order
    FROM pg_catalog.unnest(v_replacement_targets) AS replacement(replacement_order)
    EXCEPT
    SELECT removed_order
    FROM pg_catalog.unnest(v_removed_orders) AS removed(removed_order)
  ) THEN
    RAISE EXCEPTION 'The terminal removals and proposed stop replacements do not match.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(DISTINCT proposal_point.proposed_stop_order)::integer,
    pg_catalog.min(proposal_point.proposed_stop_order),
    pg_catalog.max(proposal_point.proposed_stop_order)
  INTO
    v_active_count,
    v_active_distinct_orders,
    v_active_min_order,
    v_active_max_order
  FROM public.route_change_proposal_points AS proposal_point
  WHERE proposal_point.proposal_id = v_proposal_id
    AND proposal_point.is_removed_from_route IS FALSE;

  IF v_active_count < 2
     OR v_active_distinct_orders <> v_active_count
     OR v_active_min_order <> 1
     OR v_active_max_order <> v_active_count
  THEN
    RAISE EXCEPTION 'The final active route sequence must contain at least two points numbered consecutively from 1.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.route_change_proposals AS proposal
  SET contributor_remarks = v_remarks
  WHERE proposal.id = v_proposal_id
    AND proposal.contributor_id = v_actor
    AND proposal.status = 'pending';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'The pending route proposal could not store its contributor remarks.'
      USING ERRCODE = '40001';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_route_change_proposal_with_lifecycle_edits(bigint, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_change_proposal_with_lifecycle_edits(bigint, text, jsonb)
  TO authenticated;

-- ============================================================
-- 4. APPLY ROUTE-SPECIFIC REPLACEMENTS, SHARED-LOCATION EDITS,
--    AND FINAL ORDER IN THE SAME MODERATION TRANSACTION.
--
-- Removed terminal rows are detached ONLY from NEW.route_id. The
-- terminal entity itself remains intact for every other route.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_route_change_proposal_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rejection_note text;
  v_active_point_count integer;
  v_removed_point_count integer;
  v_route_stop_count integer;
  v_removed_link_count integer;
  v_updated_count integer;
  v_order_shift bigint;
BEGIN
  IF OLD.status IS DISTINCT FROM 'pending'
     OR NEW.status IS NOT DISTINCT FROM OLD.status
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    -- Fail closed when an active shared point's name or coordinates
    -- changed after the contributor captured its original-value snapshot.
    IF EXISTS (
      SELECT 1
      FROM public.route_change_proposal_points AS proposal_point
      LEFT JOIN public.terminals AS terminal_row
        ON terminal_row.id = proposal_point.terminal_id
      LEFT JOIN public.stops AS stop_row
        ON stop_row.id = proposal_point.stop_id
      WHERE proposal_point.proposal_id = NEW.id
        AND proposal_point.is_new_point IS FALSE
        AND proposal_point.is_removed_from_route IS FALSE
        AND (
          (
            proposal_point.proposed_name IS NOT NULL
            AND proposal_point.original_name IS NOT NULL
            AND (
              CASE
                WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.name
                ELSE stop_row.name
              END
            ) IS DISTINCT FROM proposal_point.original_name
          )
          OR (
            proposal_point.proposed_latitude IS NOT NULL
            AND (
              CASE
                WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.latitude
                ELSE stop_row.latitude
              END
            ) IS DISTINCT FROM proposal_point.original_latitude
          )
          OR (
            proposal_point.proposed_longitude IS NOT NULL
            AND (
              CASE
                WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.longitude
                ELSE stop_row.longitude
              END
            ) IS DISTINCT FROM proposal_point.original_longitude
          )
        )
    ) THEN
      RAISE EXCEPTION
        'One of the shared locations changed after this proposal was submitted. Review the route and submit a fresh proposal.'
        USING ERRCODE = '40001';
    END IF;

    -- Shared corrections apply only to locations that remain in the route.
    UPDATE public.stops AS stop_row
    SET
      name = COALESCE(proposal_point.proposed_name, stop_row.name),
      latitude = COALESCE(proposal_point.proposed_latitude, stop_row.latitude),
      longitude = COALESCE(proposal_point.proposed_longitude, stop_row.longitude)
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.stop_id = stop_row.id
      AND proposal_point.is_new_point IS FALSE
      AND proposal_point.is_removed_from_route IS FALSE
      AND (
        proposal_point.proposed_name IS NOT NULL
        OR proposal_point.proposed_latitude IS NOT NULL
      );

    UPDATE public.terminals AS terminal_row
    SET
      name = COALESCE(proposal_point.proposed_name, terminal_row.name),
      latitude = COALESCE(proposal_point.proposed_latitude, terminal_row.latitude),
      longitude = COALESCE(proposal_point.proposed_longitude, terminal_row.longitude)
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.terminal_id = terminal_row.id
      AND proposal_point.is_new_point IS FALSE
      AND proposal_point.is_removed_from_route IS FALSE
      AND (
        proposal_point.proposed_name IS NOT NULL
        OR proposal_point.proposed_latitude IS NOT NULL
      );

    -- Detach replaced terminals only from this route. Do not delete or
    -- mutate the shared terminal record because other routes may use it.
    SELECT pg_catalog.count(*)::integer
    INTO v_removed_point_count
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS TRUE;

    DELETE FROM public.route_stops AS route_stop
    USING public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS TRUE
      AND route_stop.route_id = NEW.route_id
      AND route_stop.terminal_id IS NOT DISTINCT FROM proposal_point.terminal_id
      AND route_stop.stop_id IS NOT DISTINCT FROM proposal_point.stop_id;

    GET DIAGNOSTICS v_removed_link_count = ROW_COUNT;
    IF v_removed_link_count <> v_removed_point_count THEN
      RAISE EXCEPTION
        'The route no longer contains every terminal marked for replacement. The proposal was not applied.'
        USING ERRCODE = '40001';
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO v_active_point_count
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS FALSE;

    SELECT pg_catalog.count(*)::integer
    INTO v_route_stop_count
    FROM public.route_stops AS route_stop
    WHERE route_stop.route_id = NEW.route_id;

    IF v_active_point_count < 2 OR v_route_stop_count <> v_active_point_count THEN
      RAISE EXCEPTION
        'The approved route locations do not match the complete active proposal sequence. The route was not reordered.'
        USING ERRCODE = '40001';
    END IF;

    -- Move all remaining rows outside the final range first so that a
    -- unique (route_id, stop_order) index cannot collide during reorder.
    SELECT COALESCE(pg_catalog.max(route_stop.stop_order), 0)::bigint
    INTO v_order_shift
    FROM public.route_stops AS route_stop
    WHERE route_stop.route_id = NEW.route_id;

    v_order_shift := v_order_shift + v_active_point_count + 1;

    UPDATE public.route_stops AS route_stop
    SET stop_order = route_stop.stop_order + v_order_shift
    WHERE route_stop.route_id = NEW.route_id;

    UPDATE public.route_stops AS route_stop
    SET stop_order = proposal_point.proposed_stop_order
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.is_removed_from_route IS FALSE
      AND proposal_point.proposed_stop_order > 0
      AND route_stop.route_id = NEW.route_id
      AND route_stop.terminal_id IS NOT DISTINCT FROM proposal_point.terminal_id
      AND route_stop.stop_id IS NOT DISTINCT FROM proposal_point.stop_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_active_point_count THEN
      RAISE EXCEPTION
        'Not every active proposed route location could be placed in the final sequence.'
        USING ERRCODE = '40001';
    END IF;

    -- A converted terminal is now represented in this route by the new
    -- stop's route_stops row. The original terminal remains reusable elsewhere.
    UPDATE public.map_images AS image_row
    SET
      is_approved = true,
      moderation_status = 'approved',
      moderation_note = NULL,
      moderated_by = NEW.moderated_by,
      moderated_at = COALESCE(NEW.moderated_at, pg_catalog.clock_timestamp())
    WHERE image_row.route_change_proposal_id = NEW.id
      AND image_row.is_deleted IS FALSE
      AND image_row.is_banned IS FALSE
      AND image_row.moderation_status = 'pending';

  ELSIF NEW.status IN ('rejected', 'conflicted', 'withdrawn') THEN
    v_rejection_note := COALESCE(
      NULLIF(pg_catalog.btrim(NEW.moderation_note), ''),
      CASE NEW.status
        WHEN 'conflicted' THEN 'The associated route-change proposal conflicted with the current route.'
        WHEN 'withdrawn' THEN 'The associated route-change proposal was withdrawn.'
        ELSE 'The associated route-change proposal was rejected.'
      END
    );

    UPDATE public.map_images AS image_row
    SET
      is_approved = false,
      moderation_status = 'rejected',
      moderation_note = v_rejection_note,
      moderated_by = NEW.moderated_by,
      moderated_at = COALESCE(NEW.moderated_at, pg_catalog.clock_timestamp())
    WHERE image_row.route_change_proposal_id = NEW.id
      AND image_row.is_deleted IS FALSE
      AND image_row.moderation_status = 'pending';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_route_change_proposal_edits
  ON public.route_change_proposals;

CREATE TRIGGER trg_apply_route_change_proposal_edits
AFTER UPDATE OF status ON public.route_change_proposals
FOR EACH ROW
EXECUTE FUNCTION public.apply_route_change_proposal_edits();

COMMIT;
