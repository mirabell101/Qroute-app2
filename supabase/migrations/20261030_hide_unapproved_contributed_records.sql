-- Public transit rows are visible only after explicit admin approval.
-- Moderators retain access to every row for review.
DO $migration$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['terminals', 'stops', 'routes'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Hide unapproved or removed ' || v_table,
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated
       USING (
         public.is_moderator() OR (
           is_approved IS TRUE
           AND moderation_status = ''approved''
           AND is_active IS TRUE
           AND COALESCE(is_deleted, false) = false
           AND deleted_at IS NULL
           AND COALESCE(is_banned, false) = false
         )
       )',
      'Hide unapproved or removed ' || v_table,
      v_table
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'anon_read_public_transit',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon
       USING (
         is_approved IS TRUE
         AND moderation_status = ''approved''
         AND is_active IS TRUE
         AND COALESCE(is_deleted, false) = false
         AND deleted_at IS NULL
         AND COALESCE(is_banned, false) = false
       )',
      'anon_read_public_transit',
      v_table
    );
  END LOOP;
END;
$migration$;

-- A route-stop relationship is public only when its route and its referenced
-- terminal or stop are both approved and otherwise visible.
DROP POLICY IF EXISTS "Route stops follow route visibility"
  ON public.route_stops;
CREATE POLICY "Route stops follow approved route and point visibility"
  ON public.route_stops AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_moderator()
    OR (
      EXISTS (
        SELECT 1
        FROM public.routes AS r
        WHERE r.id = route_stops.route_id
          AND r.is_approved IS TRUE
          AND r.moderation_status = 'approved'
          AND r.is_active IS TRUE
          AND COALESCE(r.is_deleted, false) = false
          AND r.deleted_at IS NULL
          AND COALESCE(r.is_banned, false) = false
      )
      AND (
        (
          route_stops.terminal_id IS NOT NULL
          AND route_stops.stop_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.terminals AS t
            WHERE t.id = route_stops.terminal_id
              AND t.is_approved IS TRUE
              AND t.moderation_status = 'approved'
              AND t.is_active IS TRUE
              AND COALESCE(t.is_deleted, false) = false
              AND t.deleted_at IS NULL
              AND COALESCE(t.is_banned, false) = false
          )
        )
        OR (
          route_stops.stop_id IS NOT NULL
          AND route_stops.terminal_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.stops AS s
            WHERE s.id = route_stops.stop_id
              AND s.is_approved IS TRUE
              AND s.moderation_status = 'approved'
              AND s.is_active IS TRUE
              AND COALESCE(s.is_deleted, false) = false
              AND s.deleted_at IS NULL
              AND COALESCE(s.is_banned, false) = false
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "anon_read_public_transit" ON public.route_stops;
CREATE POLICY "anon_read_public_transit" ON public.route_stops
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.routes AS r
      WHERE r.id = route_stops.route_id
        AND r.is_approved IS TRUE
        AND r.moderation_status = 'approved'
        AND r.is_active IS TRUE
        AND COALESCE(r.is_deleted, false) = false
        AND r.deleted_at IS NULL
        AND COALESCE(r.is_banned, false) = false
    )
    AND (
      (
        route_stops.terminal_id IS NOT NULL
        AND route_stops.stop_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.terminals AS t
          WHERE t.id = route_stops.terminal_id
            AND t.is_approved IS TRUE
            AND t.moderation_status = 'approved'
            AND t.is_active IS TRUE
            AND COALESCE(t.is_deleted, false) = false
            AND t.deleted_at IS NULL
            AND COALESCE(t.is_banned, false) = false
        )
      )
      OR (
        route_stops.stop_id IS NOT NULL
        AND route_stops.terminal_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.stops AS s
          WHERE s.id = route_stops.stop_id
            AND s.is_approved IS TRUE
            AND s.moderation_status = 'approved'
            AND s.is_active IS TRUE
            AND COALESCE(s.is_deleted, false) = false
            AND s.deleted_at IS NULL
            AND COALESCE(s.is_banned, false) = false
        )
      )
    )
  );

-- A pending or rejected image is private even to its submitter. Admins retain
-- access to every image for moderation.
DROP POLICY IF EXISTS "Hide unapproved or removed map images"
  ON public.map_images;
CREATE POLICY "Hide unapproved or removed map images"
  ON public.map_images AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_moderator()
    OR (
      is_approved IS TRUE
      AND moderation_status = 'approved'
      AND COALESCE(is_deleted, false) = false
      AND COALESCE(is_banned, false) = false
      AND (
        (
          terminal_id IS NOT NULL
          AND stop_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.terminals AS t
            WHERE t.id = map_images.terminal_id
              AND t.is_approved IS TRUE
              AND t.moderation_status = 'approved'
              AND t.is_active IS TRUE
              AND COALESCE(t.is_deleted, false) = false
              AND t.deleted_at IS NULL
              AND COALESCE(t.is_banned, false) = false
          )
        )
        OR (
          stop_id IS NOT NULL
          AND terminal_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.stops AS s
            WHERE s.id = map_images.stop_id
              AND s.is_approved IS TRUE
              AND s.moderation_status = 'approved'
              AND s.is_active IS TRUE
              AND COALESCE(s.is_deleted, false) = false
              AND s.deleted_at IS NULL
              AND COALESCE(s.is_banned, false) = false
          )
        )
      )
    )
  );

-- Do not let an owner use the Storage API to read a pending image file.
DROP POLICY IF EXISTS "Read approved, own, or moderated map images"
  ON storage.objects;
CREATE POLICY "Read approved or moderated map images"
  ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id = 'map-images'
    AND (
      public.is_moderator()
      OR EXISTS (
        SELECT 1
        FROM public.map_images AS mi
        WHERE mi.storage_path = objects.name
          AND mi.is_approved IS TRUE
          AND mi.moderation_status = 'approved'
          AND COALESCE(mi.is_deleted, false) = false
          AND COALESCE(mi.is_banned, false) = false
          AND (
            (
              mi.terminal_id IS NOT NULL
              AND mi.stop_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM public.terminals AS t
                WHERE t.id = mi.terminal_id
                  AND t.is_approved IS TRUE
                  AND t.moderation_status = 'approved'
                  AND t.is_active IS TRUE
                  AND COALESCE(t.is_deleted, false) = false
                  AND t.deleted_at IS NULL
                  AND COALESCE(t.is_banned, false) = false
              )
            )
            OR (
              mi.stop_id IS NOT NULL
              AND mi.terminal_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM public.stops AS s
                WHERE s.id = mi.stop_id
                  AND s.is_approved IS TRUE
                  AND s.moderation_status = 'approved'
                  AND s.is_active IS TRUE
                  AND COALESCE(s.is_deleted, false) = false
                  AND s.deleted_at IS NULL
                  AND COALESCE(s.is_banned, false) = false
              )
            )
          )
      )
    )
  );

-- The contribution RPC returns newly-created IDs so the client can attach
-- uploaded photos. Run it with its trusted owner to allow that limited
-- response while SELECT policies keep the pending rows themselves hidden.
ALTER FUNCTION public.submit_contribution(text, jsonb) SECURITY DEFINER;
ALTER FUNCTION public.submit_contribution(text, jsonb)
  SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION public.submit_contribution(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_contribution(text, jsonb)
  TO authenticated;
