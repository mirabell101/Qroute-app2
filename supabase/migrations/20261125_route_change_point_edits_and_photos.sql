BEGIN;

-- ============================================================
-- 1. STORE PROPOSED NAME CHANGES ON INDIVIDUAL ROUTE POINTS
-- ============================================================

ALTER TABLE public.route_change_proposal_points
  ADD COLUMN IF NOT EXISTS proposed_name text,
  ADD COLUMN IF NOT EXISTS original_name text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.route_change_proposal_points'::regclass
      AND constraint_row.conname = 'route_change_proposal_points_proposed_name_check'
  ) THEN
    ALTER TABLE public.route_change_proposal_points
      ADD CONSTRAINT route_change_proposal_points_proposed_name_check
      CHECK (
        proposed_name IS NULL
        OR (
          pg_catalog.char_length(pg_catalog.btrim(proposed_name)) BETWEEN 1 AND 120
        )
      );
  END IF;
END;
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.route_change_proposal_points'::regclass
      AND constraint_row.conname = 'route_change_proposal_points_edits_existing_only'
  ) THEN
    ALTER TABLE public.route_change_proposal_points
      ADD CONSTRAINT route_change_proposal_points_edits_existing_only
      CHECK (
        proposed_name IS NULL
        OR (is_new_point IS FALSE AND original_name IS NOT NULL)
      );
  END IF;
END;
$migration$;

-- ============================================================
-- 2. TIE PROPOSED PHOTOS TO A POINT IN A ROUTE PROPOSAL
--
-- The photo still references its stop/terminal in map_images so
-- that the normal map image reader can display it after approval.
-- The extra proposal fields keep it pending/reviewable as part of
-- the route-change proposal while that proposal is pending.
-- ============================================================

ALTER TABLE public.map_images
  ADD COLUMN IF NOT EXISTS route_change_proposal_id bigint,
  ADD COLUMN IF NOT EXISTS route_change_proposal_stop_order integer;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.map_images'::regclass
      AND constraint_row.conname = 'map_images_route_change_proposal_id_fkey'
  ) THEN
    ALTER TABLE public.map_images
      ADD CONSTRAINT map_images_route_change_proposal_id_fkey
      FOREIGN KEY (route_change_proposal_id)
      REFERENCES public.route_change_proposals(id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.map_images'::regclass
      AND constraint_row.conname = 'map_images_route_change_proposal_context_check'
  ) THEN
    ALTER TABLE public.map_images
      ADD CONSTRAINT map_images_route_change_proposal_context_check
      CHECK (
        (route_change_proposal_id IS NULL AND route_change_proposal_stop_order IS NULL)
        OR (
          route_change_proposal_id IS NOT NULL
          AND route_change_proposal_stop_order IS NOT NULL
          AND route_change_proposal_stop_order > 0
        )
      );
  END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS idx_map_images_route_change_proposal
  ON public.map_images (route_change_proposal_id, route_change_proposal_stop_order)
  WHERE route_change_proposal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_map_images_route_proposal_point
  ON public.map_images (route_change_proposal_id, route_change_proposal_stop_order)
  WHERE route_change_proposal_id IS NOT NULL;

-- ============================================================
-- 3. SUBMIT A COMPLETE ROUTE PROPOSAL WITH EXISTING-POINT EDITS
--
-- This wrapper delegates route construction and all existing
-- compatibility/sequence checks to the established RPC. It then
-- stores proposed names only against existing proposal locations.
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
  v_proposed_name text;
  v_original_name text;
  v_updated_count integer;
  v_seen_orders integer[] := ARRAY[]::integer[];
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

  IF p_payload ? 'point_edits' THEN
    IF pg_catalog.jsonb_typeof(p_payload -> 'point_edits')
       IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'Point edits must be supplied as an array.'
        USING ERRCODE = '22023';
    END IF;
    v_point_edits := p_payload -> 'point_edits';
  ELSE
    v_point_edits := '[]'::pg_catalog.jsonb;
  END IF;

  -- Pass only fields accepted by the original, already-deployed RPC.
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
      WHERE edit_key.key NOT IN ('stop_order', 'proposed_name')
    ) THEN
      RAISE EXCEPTION 'A point edit contains unsupported fields.'
        USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v_edit -> 'stop_order') IS DISTINCT FROM 'number'
       OR (v_edit ->> 'stop_order') !~ '^[1-9][0-9]*$'
    THEN
      RAISE EXCEPTION 'A point edit needs a positive sequence number.'
        USING ERRCODE = '22023';
    END IF;

    v_stop_order := (v_edit ->> 'stop_order')::integer;

    IF v_stop_order = ANY(v_seen_orders) THEN
      RAISE EXCEPTION 'A route point can only have one proposed name edit.'
        USING ERRCODE = '22023';
    END IF;
    v_seen_orders := pg_catalog.array_append(v_seen_orders, v_stop_order);

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

    -- Snapshot the current shared name as well. This prevents an approval
    -- from silently overwriting a later rename of a reused, non-route point.
    SELECT
      CASE
        WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.name
        ELSE stop_row.name
      END
    INTO v_original_name
    FROM public.route_change_proposal_points AS proposal_point
    LEFT JOIN public.terminals AS terminal_row
      ON terminal_row.id = proposal_point.terminal_id
    LEFT JOIN public.stops AS stop_row
      ON stop_row.id = proposal_point.stop_id
    WHERE proposal_point.proposal_id = v_proposal_id
      AND proposal_point.stop_order = v_stop_order
      AND proposal_point.is_new_point IS FALSE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Only an existing terminal or stop in the proposed sequence can receive a name edit.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.route_change_proposal_points AS proposal_point
    SET
      proposed_name = v_proposed_name,
      original_name = v_original_name
    WHERE proposal_point.proposal_id = v_proposal_id
      AND proposal_point.stop_order = v_stop_order
      AND proposal_point.is_new_point IS FALSE;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'Unable to store the proposed point name.'
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
-- 4. ATTACH AN UPLOADED FILE TO A PENDING PROPOSAL POINT
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
    AND proposal_point.stop_order = p_stop_order;

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
-- 5. APPLY/REJECT PROPOSED NAMES AND IMAGES WITH THE PROPOSAL
--
-- The existing moderator RPC updates proposal status inside the same
-- transaction as route synchronization. This trigger makes proposed
-- point names and proposal photos part of that same transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_route_change_proposal_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rejection_note text;
BEGIN
  IF OLD.status IS DISTINCT FROM 'pending'
     OR NEW.status IS NOT DISTINCT FROM OLD.status
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    -- Fail closed if a reused location outside the original route was
    -- renamed after this proposal captured its original name.
    IF EXISTS (
      SELECT 1
      FROM public.route_change_proposal_points AS proposal_point
      LEFT JOIN public.terminals AS terminal_row
        ON terminal_row.id = proposal_point.terminal_id
      LEFT JOIN public.stops AS stop_row
        ON stop_row.id = proposal_point.stop_id
      WHERE proposal_point.proposal_id = NEW.id
        AND proposal_point.is_new_point IS FALSE
        AND proposal_point.proposed_name IS NOT NULL
        AND proposal_point.original_name IS NOT NULL
        AND (
          CASE
            WHEN proposal_point.terminal_id IS NOT NULL THEN terminal_row.name
            ELSE stop_row.name
          END
        ) IS DISTINCT FROM proposal_point.original_name
    ) THEN
      RAISE EXCEPTION
        'One of the existing locations was renamed after this proposal was submitted. Review the location again and submit a fresh proposal.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.stops AS stop_row
    SET name = proposal_point.proposed_name
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.stop_id = stop_row.id
      AND proposal_point.is_new_point IS FALSE
      AND proposal_point.proposed_name IS NOT NULL
      AND stop_row.name IS DISTINCT FROM proposal_point.proposed_name;

    UPDATE public.terminals AS terminal_row
    SET name = proposal_point.proposed_name
    FROM public.route_change_proposal_points AS proposal_point
    WHERE proposal_point.proposal_id = NEW.id
      AND proposal_point.terminal_id = terminal_row.id
      AND proposal_point.is_new_point IS FALSE
      AND proposal_point.proposed_name IS NOT NULL
      AND terminal_row.name IS DISTINCT FROM proposal_point.proposed_name;

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

-- ============================================================
-- 6. ALLOW THE CONTRIBUTOR AND ROUTE MODERATORS TO READ THE
--    PHOTO ROWS BELONGING TO A ROUTE-CHANGE PROPOSAL
-- ============================================================

DROP POLICY IF EXISTS route_change_proposal_images_select
  ON public.map_images;

CREATE POLICY route_change_proposal_images_select
ON public.map_images
FOR SELECT
TO authenticated
USING (
  route_change_proposal_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.route_change_proposals AS proposal
    WHERE proposal.id = map_images.route_change_proposal_id
      AND (
        proposal.contributor_id = (SELECT auth.uid())
        OR public.is_moderator()
      )
  )
);

COMMIT;
