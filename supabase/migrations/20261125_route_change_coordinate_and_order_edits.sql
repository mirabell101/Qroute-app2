BEGIN;

-- ============================================================
-- 1. KEEP THE LEGACY MODERATION ORDER AND THE PROPOSED ORDER
--    SEPARATE, AND STORE SAFE COORDINATE-EDIT SNAPSHOTS.
--
-- stop_order remains the canonical order used by the existing
-- submit/moderate RPCs and their route-snapshot checks.
-- proposed_stop_order is the contributor's final sequence and is
-- applied only after the existing moderation RPC approves the proposal.
-- ============================================================

ALTER TABLE public.route_change_proposal_points
  ADD COLUMN IF NOT EXISTS proposed_stop_order integer,
  ADD COLUMN IF NOT EXISTS proposed_latitude double precision,
  ADD COLUMN IF NOT EXISTS proposed_longitude double precision,
  ADD COLUMN IF NOT EXISTS original_latitude double precision,
  ADD COLUMN IF NOT EXISTS original_longitude double precision;

UPDATE public.route_change_proposal_points
SET proposed_stop_order = stop_order
WHERE proposed_stop_order IS NULL;

ALTER TABLE public.route_change_proposal_points
  ALTER COLUMN proposed_stop_order SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.route_change_proposal_points'::regclass
      AND constraint_row.conname = 'route_change_proposal_points_proposed_order_check'
  ) THEN
    ALTER TABLE public.route_change_proposal_points
      ADD CONSTRAINT route_change_proposal_points_proposed_order_check
      CHECK (proposed_stop_order > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.route_change_proposal_points'::regclass
      AND constraint_row.conname = 'route_change_proposal_points_proposed_coordinates_check'
  ) THEN
    ALTER TABLE public.route_change_proposal_points
      ADD CONSTRAINT route_change_proposal_points_proposed_coordinates_check
      CHECK (
        (proposed_latitude IS NULL AND proposed_longitude IS NULL)
        OR (
          proposed_latitude IS NOT NULL
          AND proposed_longitude IS NOT NULL
          AND proposed_latitude BETWEEN -90 AND 90
          AND proposed_longitude BETWEEN -180 AND 180
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.route_change_proposal_points'::regclass
      AND constraint_row.conname = 'route_change_proposal_points_original_coordinates_check'
  ) THEN
    ALTER TABLE public.route_change_proposal_points
      ADD CONSTRAINT route_change_proposal_points_original_coordinates_check
      CHECK (
        (original_latitude IS NULL AND original_longitude IS NULL)
        OR (
          original_latitude IS NOT NULL
          AND original_longitude IS NOT NULL
          AND original_latitude BETWEEN -90 AND 90
          AND original_longitude BETWEEN -180 AND 180
        )
      );
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_route_change_proposal_points_proposed_order
  ON public.route_change_proposal_points (proposal_id, proposed_stop_order);

-- ============================================================
-- 2. EXTEND THE EXISTING WRAPPER RPC.
--
-- point_edits is now a complete mapping between the legacy
-- stop_order and the contributor's proposed_stop_order. Optional
-- fields store name and coordinate changes for shared locations.
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

  IF pg_catalog.jsonb_typeof(p_payload -> 'points') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'The complete canonical route sequence is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'point_edits' THEN
    IF pg_catalog.jsonb_typeof(p_payload -> 'point_edits')
       IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'Point edits must be supplied as an array.'
        USING ERRCODE = '22023';
    END IF;
    v_point_edits := p_payload -> 'point_edits';
  ELSE
    RAISE EXCEPTION 'A final sequence position is required for every route point.'
      USING ERRCODE = '22023';
  END IF;

  -- Preserve the deployed RPC's canonical sequence and its existing
  -- validation / route-snapshot behaviour.
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
        'stop_order',
        'proposed_stop_order',
        'proposed_name',
        'latitude',
        'longitude'
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
      IF v_proposed_name = ''
         OR pg_catalog.char_length(v_proposed_name) > 120
      THEN
        RAISE EXCEPTION 'A proposed point name must contain 1 to 120 characters.'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_proposed_latitude := NULL;
    v_proposed_longitude := NULL;
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

    IF v_is_new_point THEN
      IF v_proposed_name IS NOT NULL OR v_has_latitude THEN
        RAISE EXCEPTION 'New points already carry their proposed name and coordinates.'
          USING ERRCODE = '22023';
      END IF;

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

  IF pg_catalog.cardinality(v_seen_orders) <> v_point_count
     OR pg_catalog.cardinality(v_seen_proposed_orders) <> v_point_count
  THEN
    RAISE EXCEPTION 'The proposed sequence mapping is incomplete.'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_route_change_proposal_with_edits(bigint, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_change_proposal_with_edits(bigint, text, jsonb)
  TO authenticated;

-- ============================================================
-- 3. ATTACH PHOTOS BY THE CONTRIBUTOR'S FINAL PROPOSED ORDER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_route_change_proposal_image(
  p_proposal_id bigint,
  p_stop_order integer,
  p_storage_path text,
  p_caption text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_proposal public.route_change_proposals%ROWTYPE;
  v_terminal_id bigint;
  v_stop_id bigint;
  v_expected_prefix text;
  v_image_id bigint;
  v_caption text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT role_row.role::text
  INTO v_role
  FROM public.user_roles AS role_row
  WHERE role_row.user_id = v_actor;

  IF v_role IS NULL OR v_role NOT IN ('registered_user', 'admin') THEN
    RAISE EXCEPTION 'Route contribution access required.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_user_banned() THEN
    RAISE EXCEPTION 'This account is banned from submitting content.'
      USING ERRCODE = '42501';
  END IF;

  IF p_proposal_id IS NULL OR p_proposal_id < 1
     OR p_stop_order IS NULL OR p_stop_order < 1
  THEN
    RAISE EXCEPTION 'A valid proposal and point sequence are required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_storage_path IS NULL OR pg_catalog.char_length(p_storage_path) > 512 THEN
    RAISE EXCEPTION 'The uploaded image path is invalid.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_proposal
  FROM public.route_change_proposals AS proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route-change proposal not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_proposal.contributor_id IS DISTINCT FROM v_actor
     OR v_proposal.status IS DISTINCT FROM 'pending'
  THEN
    RAISE EXCEPTION 'Only the contributor can add images to their pending proposal.'
      USING ERRCODE = '42501';
  END IF;

  v_expected_prefix :=
    v_actor::text || '/route-change-proposals/' ||
    p_proposal_id::text || '/' || p_stop_order::text || '/';

  IF pg_catalog.left(p_storage_path, pg_catalog.char_length(v_expected_prefix))
     IS DISTINCT FROM v_expected_prefix
  THEN
    RAISE EXCEPTION 'The uploaded image path does not belong to this proposal point.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS stored_object
    WHERE stored_object.bucket_id = 'map-images'
      AND stored_object.name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'The uploaded image could not be found in storage.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    proposal_point.terminal_id,
    proposal_point.stop_id
  INTO
    v_terminal_id,
    v_stop_id
  FROM public.route_change_proposal_points AS proposal_point
  WHERE proposal_point.proposal_id = p_proposal_id
    AND proposal_point.proposed_stop_order = p_stop_order;

  IF NOT FOUND OR (v_terminal_id IS NULL AND v_stop_id IS NULL) THEN
    RAISE EXCEPTION 'The selected point is not part of this route proposal.'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.map_images AS image_row
    WHERE image_row.route_change_proposal_id = p_proposal_id
      AND image_row.route_change_proposal_stop_order = p_stop_order
      AND image_row.is_deleted IS FALSE
  ) THEN
    RAISE EXCEPTION 'A photo is already attached to this proposal point.'
      USING ERRCODE = '23505';
  END IF;

  v_caption := NULLIF(
    pg_catalog.left(pg_catalog.btrim(COALESCE(p_caption, '')), 500),
    ''
  );

  INSERT INTO public.map_images (
    terminal_id,
    stop_id,
    storage_path,
    caption,
    created_by,
    is_approved,
    moderation_status,
    is_banned,
    is_deleted,
    route_change_proposal_id,
    route_change_proposal_stop_order
  )
  VALUES (
    v_terminal_id,
    v_stop_id,
    p_storage_path,
    v_caption,
    v_actor,
    false,
    'pending',
    false,
    false,
    p_proposal_id,
    p_stop_order
  )
  RETURNING id INTO v_image_id;

  RETURN pg_catalog.jsonb_build_object(
    'image_id', v_image_id,
    'proposal_id', p_proposal_id,
    'stop_order', p_stop_order,
    'moderation_status', 'pending'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_route_change_proposal_image(bigint, integer, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_change_proposal_image(bigint, integer, text, text)
  TO authenticated;

-- ============================================================
-- 4. APPLY COORDINATE EDITS AND THE FINAL ORDER ON APPROVAL.
--
-- This runs inside the existing moderator RPC transaction after
-- its legacy route synchronization has completed. If an existing
-- location moved independently, or the final route rows do not match
-- this complete proposal, approval fails and rolls back as one unit.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_route_change_proposal_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rejection_note text;
  v_proposal_point_count integer;
  v_route_stop_count integer;
  v_updated_count integer;
  v_order_shift bigint;
BEGIN
  IF OLD.status IS DISTINCT FROM 'pending'
     OR NEW.status IS NOT DISTINCT FROM OLD.status
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    -- Fail closed when a shared name or coordinate changed after the
    -- contributor captured the corresponding original-value snapshot.
    IF EXISTS (
      SELECT 1
      FROM public.route_change_proposal_points AS proposal_point
      LEFT JOIN public.terminals AS terminal_row
        ON terminal_row.id = proposal_point.terminal_id
      LEFT JOIN public.stops AS stop_row
        ON stop_row.id = proposal_point.stop_id
      WHERE proposal_point.proposal_id = NEW.id
        AND proposal_point.is_new_point IS FALSE
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

    UPDATE public.stops AS stop_row
    SET
      name = COALESCE(proposal_point.proposed_name, stop_row.name),
      latitude = COALESCE(proposal_point.proposed_latitude, stop_row.latitude),
      longitude = COALESCE(proposal_point.proposed_longitude, stop_row.longitude)
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.stop_id = stop_row.id
      AND proposal_point.is_new_point IS FALSE
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
      AND (
        proposal_point.proposed_name IS NOT NULL
        OR proposal_point.proposed_latitude IS NOT NULL
      );

    -- The legacy moderation RPC has now synchronized the route in the
    -- canonical sequence. Shift its stop_order values above the current
    -- range first, avoiding collisions with a per-route unique index.
    SELECT pg_catalog.count(*)::integer
    INTO v_proposal_point_count
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id;

    SELECT
      pg_catalog.count(*)::integer,
      COALESCE(pg_catalog.max(route_stop.stop_order), 0)::bigint
    INTO
      v_route_stop_count,
      v_order_shift
    FROM public.route_stops AS route_stop
    WHERE route_stop.route_id = NEW.route_id;

    IF v_proposal_point_count < 2
       OR v_route_stop_count <> v_proposal_point_count
    THEN
      RAISE EXCEPTION
        'The approved route locations do not match the complete proposed sequence. The route was not reordered.'
        USING ERRCODE = '40001';
    END IF;

    v_order_shift := v_order_shift + v_proposal_point_count + 1;

    UPDATE public.route_stops AS route_stop
    SET stop_order = route_stop.stop_order + v_order_shift
    WHERE route_stop.route_id = NEW.route_id;

    UPDATE public.route_stops AS route_stop
    SET stop_order = proposal_point.proposed_stop_order
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND route_stop.route_id = NEW.route_id
      AND route_stop.terminal_id IS NOT DISTINCT FROM proposal_point.terminal_id
      AND route_stop.stop_id IS NOT DISTINCT FROM proposal_point.stop_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_proposal_point_count THEN
      RAISE EXCEPTION
        'Not every proposed route location could be placed in the final sequence.'
        USING ERRCODE = '40001';
    END IF;

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
