BEGIN;

-- ============================================================================
-- QROUTE PUBLIC MAP-IMAGE PUBLICATION
--
-- Storage conventions:
--   Private source bucket: map-images
--   Public destination:    map-images-public
--
-- The application server copies objects with its service-role client. This
-- migration only finalizes publication after the copy exists and revalidates
-- the image, parent location, proposal point, route, and final route sequence.
-- The browser never receives access to public.map_images or its private paths.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. FINALIZE ONE APPROVED IMAGE AFTER THE SERVER COPIES ITS OBJECT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_map_image(
  p_image_id bigint,
  p_public_storage_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_image public.map_images%ROWTYPE;
  v_parent_eligible boolean := false;
  v_expected_prefix text;
BEGIN
  -- This RPC is callable only by the trusted application server.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Trusted map-image publication service required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_image_id IS NULL OR p_image_id < 1 THEN
    RAISE EXCEPTION 'A valid map-image ID is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_public_storage_path IS NULL
     OR pg_catalog.char_length(p_public_storage_path) > 512
  THEN
    RAISE EXCEPTION 'The public image path is invalid.'
      USING ERRCODE = '22023';
  END IF;

  v_expected_prefix := 'published/' || p_image_id::text || '/';

  IF pg_catalog.left(
       p_public_storage_path,
       pg_catalog.char_length(v_expected_prefix)
     ) IS DISTINCT FROM v_expected_prefix
     OR pg_catalog.strpos(p_public_storage_path, '..') > 0
     OR pg_catalog.strpos(p_public_storage_path, pg_catalog.chr(92)) > 0
  THEN
    RAISE EXCEPTION 'The public image path does not match this image.'
      USING ERRCODE = '42501';
  END IF;

  SELECT image_row.*
  INTO v_image
  FROM public.map_images AS image_row
  WHERE image_row.id = p_image_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Map image not found.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent retry: never overwrite a previously assigned public path.
  IF v_image.public_storage_path IS NOT NULL THEN
    IF v_image.public_storage_path IS DISTINCT FROM p_public_storage_path THEN
      RAISE EXCEPTION 'This map image already has a different public path.'
        USING ERRCODE = '23505';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'published', true,
      'already_published', true,
      'image_id', p_image_id,
      'public_storage_path', p_public_storage_path
    );
  END IF;

  IF v_image.is_approved IS DISTINCT FROM true
     OR v_image.moderation_status IS DISTINCT FROM 'approved'
     OR v_image.is_banned IS DISTINCT FROM false
     OR v_image.is_deleted IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'Only approved, active map images can be published.'
      USING ERRCODE = '42501';
  END IF;

  -- Ensure the private source still exists and the server-side copy actually
  -- exists in the public bucket before writing public_storage_path.
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS source_object
    WHERE source_object.bucket_id = 'map-images'
      AND source_object.name = v_image.storage_path
  ) THEN
    RAISE EXCEPTION 'The private source photograph no longer exists.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS public_object
    WHERE public_object.bucket_id = 'map-images-public'
      AND public_object.name = p_public_storage_path
  ) THEN
    RAISE EXCEPTION 'The public copy must exist before publication is finalized.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Direct image: its stop or terminal must still be approved, active,
  -- unbanned, and undeleted.
  IF v_image.route_change_proposal_id IS NULL THEN
    IF v_image.stop_id IS NOT NULL AND v_image.terminal_id IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.stops AS stop_row
        WHERE stop_row.id = v_image.stop_id
          AND stop_row.is_approved IS TRUE
          AND stop_row.moderation_status = 'approved'
          AND stop_row.is_active IS TRUE
          AND stop_row.is_banned IS FALSE
          AND stop_row.is_deleted IS FALSE
      )
      INTO v_parent_eligible;
    ELSIF v_image.terminal_id IS NOT NULL AND v_image.stop_id IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.terminals AS terminal_row
        WHERE terminal_row.id = v_image.terminal_id
          AND terminal_row.is_approved IS TRUE
          AND terminal_row.moderation_status = 'approved'
          AND terminal_row.is_active IS TRUE
          AND terminal_row.is_banned IS FALSE
          AND terminal_row.is_deleted IS FALSE
      )
      INTO v_parent_eligible;
    END IF;
  ELSE
    -- Proposal image: the same proposed_stop_order must still identify the
    -- exact same stop/terminal, and that point must be present at its final
    -- position on the currently approved route. This prevents images from
    -- drifting to another point after reordering or removal proposals.
    SELECT EXISTS (
      SELECT 1
      FROM public.route_change_proposals AS proposal
      JOIN public.routes AS route_row
        ON route_row.id = proposal.route_id
      JOIN public.route_change_proposal_points AS proposal_point
        ON proposal_point.proposal_id = proposal.id
       AND proposal_point.proposed_stop_order = v_image.route_change_proposal_stop_order
       AND proposal_point.stop_id IS NOT DISTINCT FROM v_image.stop_id
       AND proposal_point.terminal_id IS NOT DISTINCT FROM v_image.terminal_id
      JOIN public.route_stops AS route_stop
        ON route_stop.route_id = proposal.route_id
       AND route_stop.stop_id IS NOT DISTINCT FROM proposal_point.stop_id
       AND route_stop.terminal_id IS NOT DISTINCT FROM proposal_point.terminal_id
       AND route_stop.stop_order = proposal_point.proposed_stop_order
      WHERE proposal.id = v_image.route_change_proposal_id
        AND proposal.status = 'approved'
        AND proposal_point.is_removed_from_route IS FALSE
        AND route_row.is_approved IS TRUE
        AND route_row.moderation_status = 'approved'
        AND route_row.is_active IS TRUE
        AND route_row.is_banned IS FALSE
        AND route_row.is_deleted IS FALSE
        AND (
          (
            v_image.stop_id IS NOT NULL
            AND v_image.terminal_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.stops AS stop_row
              WHERE stop_row.id = v_image.stop_id
                AND stop_row.is_approved IS TRUE
                AND stop_row.moderation_status = 'approved'
                AND stop_row.is_active IS TRUE
                AND stop_row.is_banned IS FALSE
                AND stop_row.is_deleted IS FALSE
            )
          )
          OR
          (
            v_image.terminal_id IS NOT NULL
            AND v_image.stop_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.terminals AS terminal_row
              WHERE terminal_row.id = v_image.terminal_id
                AND terminal_row.is_approved IS TRUE
                AND terminal_row.moderation_status = 'approved'
                AND terminal_row.is_active IS TRUE
                AND terminal_row.is_banned IS FALSE
                AND terminal_row.is_deleted IS FALSE
            )
          )
        )
    )
    INTO v_parent_eligible;
  END IF;

  IF v_parent_eligible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The map image or its associated public location is no longer eligible for publication.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.map_images AS image_row
  SET public_storage_path = p_public_storage_path
  WHERE image_row.id = p_image_id
    AND image_row.public_storage_path IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The public image path could not be assigned.'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'published', true,
    'already_published', false,
    'image_id', p_image_id,
    'public_storage_path', p_public_storage_path
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_map_image(bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_map_image(bigint, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. ANONYMOUS-SAFE PUBLIC IMAGE RETRIEVAL
-- ---------------------------------------------------------------------------
-- The only exposed fields are image ID, parent stop/terminal ID, caption,
-- and the destination path in the intentionally public bucket.
-- Private storage_path, contributor IDs, and moderation metadata are never
-- returned. Every row is filtered again against its current parent state.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_map_point_images(
  p_terminal_ids bigint[] DEFAULT ARRAY[]::bigint[],
  p_stop_ids bigint[] DEFAULT ARRAY[]::bigint[]
)
RETURNS TABLE (
  id bigint,
  terminal_id bigint,
  stop_id bigint,
  public_storage_path text,
  caption text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    image_row.id,
    image_row.terminal_id,
    image_row.stop_id,
    image_row.public_storage_path,
    image_row.caption
  FROM public.map_images AS image_row
  WHERE image_row.is_approved IS TRUE
    AND image_row.moderation_status = 'approved'
    AND image_row.is_banned IS FALSE
    AND image_row.is_deleted IS FALSE
    AND image_row.public_storage_path IS NOT NULL
    AND pg_catalog.btrim(image_row.public_storage_path) <> ''
    AND (
      (
        image_row.terminal_id IS NOT NULL
        AND image_row.stop_id IS NULL
        AND image_row.terminal_id = ANY(
          COALESCE(p_terminal_ids, ARRAY[]::bigint[])
        )
        AND (
          (
            image_row.route_change_proposal_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.terminals AS terminal_row
              WHERE terminal_row.id = image_row.terminal_id
                AND terminal_row.is_approved IS TRUE
                AND terminal_row.moderation_status = 'approved'
                AND terminal_row.is_active IS TRUE
                AND terminal_row.is_banned IS FALSE
                AND terminal_row.is_deleted IS FALSE
            )
          )
          OR
          (
            image_row.route_change_proposal_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.route_change_proposals AS proposal
              JOIN public.routes AS route_row
                ON route_row.id = proposal.route_id
              JOIN public.route_change_proposal_points AS proposal_point
                ON proposal_point.proposal_id = proposal.id
               AND proposal_point.proposed_stop_order = image_row.route_change_proposal_stop_order
               AND proposal_point.terminal_id = image_row.terminal_id
               AND proposal_point.stop_id IS NULL
              JOIN public.route_stops AS route_stop
                ON route_stop.route_id = proposal.route_id
               AND route_stop.terminal_id = proposal_point.terminal_id
               AND route_stop.stop_id IS NULL
               AND route_stop.stop_order = proposal_point.proposed_stop_order
              WHERE proposal.id = image_row.route_change_proposal_id
                AND proposal.status = 'approved'
                AND proposal_point.is_removed_from_route IS FALSE
                AND route_row.is_approved IS TRUE
                AND route_row.moderation_status = 'approved'
                AND route_row.is_active IS TRUE
                AND route_row.is_banned IS FALSE
                AND route_row.is_deleted IS FALSE
                AND EXISTS (
                  SELECT 1
                  FROM public.terminals AS terminal_row
                  WHERE terminal_row.id = image_row.terminal_id
                    AND terminal_row.is_approved IS TRUE
                    AND terminal_row.moderation_status = 'approved'
                    AND terminal_row.is_active IS TRUE
                    AND terminal_row.is_banned IS FALSE
                    AND terminal_row.is_deleted IS FALSE
                )
            )
          )
        )
      )
      OR
      (
        image_row.stop_id IS NOT NULL
        AND image_row.terminal_id IS NULL
        AND image_row.stop_id = ANY(
          COALESCE(p_stop_ids, ARRAY[]::bigint[])
        )
        AND (
          (
            image_row.route_change_proposal_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.stops AS stop_row
              WHERE stop_row.id = image_row.stop_id
                AND stop_row.is_approved IS TRUE
                AND stop_row.moderation_status = 'approved'
                AND stop_row.is_active IS TRUE
                AND stop_row.is_banned IS FALSE
                AND stop_row.is_deleted IS FALSE
            )
          )
          OR
          (
            image_row.route_change_proposal_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.route_change_proposals AS proposal
              JOIN public.routes AS route_row
                ON route_row.id = proposal.route_id
              JOIN public.route_change_proposal_points AS proposal_point
                ON proposal_point.proposal_id = proposal.id
               AND proposal_point.proposed_stop_order = image_row.route_change_proposal_stop_order
               AND proposal_point.stop_id = image_row.stop_id
               AND proposal_point.terminal_id IS NULL
              JOIN public.route_stops AS route_stop
                ON route_stop.route_id = proposal.route_id
               AND route_stop.stop_id = proposal_point.stop_id
               AND route_stop.terminal_id IS NULL
               AND route_stop.stop_order = proposal_point.proposed_stop_order
              WHERE proposal.id = image_row.route_change_proposal_id
                AND proposal.status = 'approved'
                AND proposal_point.is_removed_from_route IS FALSE
                AND route_row.is_approved IS TRUE
                AND route_row.moderation_status = 'approved'
                AND route_row.is_active IS TRUE
                AND route_row.is_banned IS FALSE
                AND route_row.is_deleted IS FALSE
                AND EXISTS (
                  SELECT 1
                  FROM public.stops AS stop_row
                  WHERE stop_row.id = image_row.stop_id
                    AND stop_row.is_approved IS TRUE
                    AND stop_row.moderation_status = 'approved'
                    AND stop_row.is_active IS TRUE
                    AND stop_row.is_banned IS FALSE
                    AND stop_row.is_deleted IS FALSE
                )
            )
          )
        )
      )
    )
  ORDER BY image_row.created_at ASC, image_row.id ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_public_map_point_images(bigint[], bigint[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_map_point_images(bigint[], bigint[])
  TO anon, authenticated;

COMMIT;
