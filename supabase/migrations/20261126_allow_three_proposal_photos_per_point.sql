BEGIN;

-- A route-change proposal point may carry up to three photographs.
-- The previous unique index limited each (proposal, proposed stop order)
-- pair to a single image, so remove that uniqueness while retaining the
-- existing non-unique lookup index.
DROP INDEX IF EXISTS public.uq_map_images_route_proposal_point;

CREATE INDEX IF NOT EXISTS idx_map_images_route_change_proposal
  ON public.map_images (route_change_proposal_id, route_change_proposal_stop_order)
  WHERE route_change_proposal_id IS NOT NULL;

-- Keep the upload RPC authoritative for the per-point limit. It already
-- locks the parent proposal FOR UPDATE, which serializes concurrent uploads
-- for that proposal before the count-and-insert operation.
CREATE OR REPLACE FUNCTION public.submit_route_change_proposal_image(
  p_proposal_id bigint,
  p_stop_order integer,
  p_storage_path text,
  p_caption text DEFAULT NULL::text
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
  v_existing_photo_count integer;
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

  SELECT pg_catalog.count(*)::integer
  INTO v_existing_photo_count
  FROM public.map_images AS image_row
  WHERE image_row.route_change_proposal_id = p_proposal_id
    AND image_row.route_change_proposal_stop_order = p_stop_order
    AND image_row.is_deleted IS FALSE;

  IF v_existing_photo_count >= 3 THEN
    RAISE EXCEPTION 'A maximum of three photos can be attached to each proposal point.'
      USING ERRCODE = '22023';
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
    'moderation_status', 'pending',
    'photo_count', v_existing_photo_count + 1,
    'photo_limit', 3
  );
END;
$function$;

-- Preserve the existing caller permissions: authenticated contributors
-- invoke the RPC with their own access token; anon/public cannot call it.
REVOKE ALL ON FUNCTION public.submit_route_change_proposal_image(bigint, integer, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_route_change_proposal_image(bigint, integer, text, text)
  TO authenticated;

COMMIT;
