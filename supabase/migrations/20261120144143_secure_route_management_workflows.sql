CREATE SCHEMA IF NOT EXISTS route_management_internal;
REVOKE ALL ON SCHEMA route_management_internal
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA route_management_internal
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION route_management_internal.is_moderator()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = v_actor
      AND role_row.role::text IN ('admin', 'moderator')
  );
END;
$$;

REVOKE ALL ON FUNCTION route_management_internal.is_moderator()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION route_management_internal.is_moderator()
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT route_management_internal.is_moderator();
$$;

REVOKE ALL ON FUNCTION public.is_moderator()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator()
  TO anon, authenticated;

CREATE FUNCTION public.is_route_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT public.is_moderator();
$$;

REVOKE ALL ON FUNCTION public.is_route_moderator()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_route_moderator()
  TO authenticated;

DROP POLICY IF EXISTS "Hide unapproved or removed terminals"
  ON public.terminals;
CREATE POLICY "Hide unapproved or removed terminals"
  ON public.terminals AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_route_moderator()
    OR (
      created_by = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.user_roles AS role_row
        WHERE role_row.user_id = (SELECT auth.uid())
          AND role_row.role::text = 'registered_user'
      )
      AND moderation_status IN ('pending', 'rejected')
      AND COALESCE(is_deleted, false) = false
      AND deleted_at IS NULL
      AND COALESCE(is_banned, false) = false
    )
    OR (
      is_approved IS TRUE
      AND moderation_status = 'approved'
      AND is_active IS TRUE
      AND COALESCE(is_deleted, false) = false
      AND deleted_at IS NULL
      AND COALESCE(is_banned, false) = false
    )
  );

DROP POLICY IF EXISTS "Hide unapproved or removed stops"
  ON public.stops;
CREATE POLICY "Hide unapproved or removed stops"
  ON public.stops AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_route_moderator()
    OR (
      created_by = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.user_roles AS role_row
        WHERE role_row.user_id = (SELECT auth.uid())
          AND role_row.role::text = 'registered_user'
      )
      AND moderation_status IN ('pending', 'rejected')
      AND COALESCE(is_deleted, false) = false
      AND deleted_at IS NULL
      AND COALESCE(is_banned, false) = false
    )
    OR (
      is_approved IS TRUE
      AND moderation_status = 'approved'
      AND is_active IS TRUE
      AND COALESCE(is_deleted, false) = false
      AND deleted_at IS NULL
      AND COALESCE(is_banned, false) = false
    )
  );

DROP POLICY IF EXISTS "Hide unapproved or removed routes"
  ON public.routes;
CREATE POLICY "Hide unapproved or removed routes"
  ON public.routes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_route_moderator()
    OR (
      created_by = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.user_roles AS role_row
        WHERE role_row.user_id = (SELECT auth.uid())
          AND role_row.role::text = 'registered_user'
      )
      AND moderation_status IN ('pending', 'rejected')
      AND COALESCE(is_deleted, false) = false
      AND deleted_at IS NULL
      AND COALESCE(is_banned, false) = false
    )
    OR (
      is_approved IS TRUE
      AND moderation_status = 'approved'
      AND is_active IS TRUE
      AND COALESCE(is_deleted, false) = false
      AND deleted_at IS NULL
      AND COALESCE(is_banned, false) = false
    )
  );

DROP POLICY IF EXISTS "Route stops follow approved route and point visibility"
  ON public.route_stops;
CREATE POLICY "Route stops follow approved route and point visibility"
  ON public.route_stops AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_route_moderator()
    OR (
      EXISTS (
        SELECT 1 FROM public.routes AS route_row
        WHERE route_row.id = route_stops.route_id
          AND route_row.is_approved IS TRUE
          AND route_row.moderation_status = 'approved'
          AND route_row.is_active IS TRUE
          AND COALESCE(route_row.is_deleted, false) = false
          AND route_row.deleted_at IS NULL
          AND COALESCE(route_row.is_banned, false) = false
      )
      AND (
        (
          route_stops.terminal_id IS NOT NULL
          AND route_stops.stop_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.terminals AS terminal_row
            WHERE terminal_row.id = route_stops.terminal_id
              AND terminal_row.is_approved IS TRUE
              AND terminal_row.moderation_status = 'approved'
              AND terminal_row.is_active IS TRUE
              AND COALESCE(terminal_row.is_deleted, false) = false
              AND terminal_row.deleted_at IS NULL
              AND COALESCE(terminal_row.is_banned, false) = false
          )
        )
        OR (
          route_stops.stop_id IS NOT NULL
          AND route_stops.terminal_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.stops AS stop_row
            WHERE stop_row.id = route_stops.stop_id
              AND stop_row.is_approved IS TRUE
              AND stop_row.moderation_status = 'approved'
              AND stop_row.is_active IS TRUE
              AND COALESCE(stop_row.is_deleted, false) = false
              AND stop_row.deleted_at IS NULL
              AND COALESCE(stop_row.is_banned, false) = false
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Hide unapproved or removed map images"
  ON public.map_images;
CREATE POLICY "Hide unapproved or removed map images"
  ON public.map_images AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_route_moderator()
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
            SELECT 1 FROM public.terminals AS terminal_row
            WHERE terminal_row.id = map_images.terminal_id
              AND terminal_row.is_approved IS TRUE
              AND terminal_row.moderation_status = 'approved'
              AND terminal_row.is_active IS TRUE
              AND COALESCE(terminal_row.is_deleted, false) = false
              AND terminal_row.deleted_at IS NULL
              AND COALESCE(terminal_row.is_banned, false) = false
          )
        )
        OR (
          stop_id IS NOT NULL
          AND terminal_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.stops AS stop_row
            WHERE stop_row.id = map_images.stop_id
              AND stop_row.is_approved IS TRUE
              AND stop_row.moderation_status = 'approved'
              AND stop_row.is_active IS TRUE
              AND COALESCE(stop_row.is_deleted, false) = false
              AND stop_row.deleted_at IS NULL
              AND COALESCE(stop_row.is_banned, false) = false
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Read approved or moderated map images"
  ON storage.objects;
CREATE POLICY "Read approved or moderated map images"
  ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id = 'map-images'
    AND (
      public.is_route_moderator()
      OR EXISTS (
        SELECT 1 FROM public.map_images AS image_row
        WHERE image_row.storage_path = objects.name
          AND image_row.is_approved IS TRUE
          AND image_row.moderation_status = 'approved'
          AND COALESCE(image_row.is_deleted, false) = false
          AND COALESCE(image_row.is_banned, false) = false
          AND (
            (
              image_row.terminal_id IS NOT NULL
              AND image_row.stop_id IS NULL
              AND EXISTS (
                SELECT 1 FROM public.terminals AS terminal_row
                WHERE terminal_row.id = image_row.terminal_id
                  AND terminal_row.is_approved IS TRUE
                  AND terminal_row.moderation_status = 'approved'
                  AND terminal_row.is_active IS TRUE
                  AND COALESCE(terminal_row.is_deleted, false) = false
                  AND terminal_row.deleted_at IS NULL
                  AND COALESCE(terminal_row.is_banned, false) = false
              )
            )
            OR (
              image_row.stop_id IS NOT NULL
              AND image_row.terminal_id IS NULL
              AND EXISTS (
                SELECT 1 FROM public.stops AS stop_row
                WHERE stop_row.id = image_row.stop_id
                  AND stop_row.is_approved IS TRUE
                  AND stop_row.moderation_status = 'approved'
                  AND stop_row.is_active IS TRUE
                  AND COALESCE(stop_row.is_deleted, false) = false
                  AND stop_row.deleted_at IS NULL
                  AND COALESCE(stop_row.is_banned, false) = false
              )
            )
          )
      )
    )
  );

ALTER FUNCTION public.submit_contribution(text, jsonb)
  RENAME TO submit_contribution_legacy;

REVOKE ALL ON FUNCTION public.submit_contribution_legacy(text, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.submit_contribution(
  p_kind text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_result jsonb;
  v_point jsonb;
  v_route_id bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT role_row.role::text
  INTO v_role
  FROM public.user_roles AS role_row
  WHERE role_row.user_id = v_actor;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'registered_user') THEN
    RAISE EXCEPTION 'Contribution access required.'
      USING ERRCODE = '42501';
  END IF;

  v_result := public.submit_contribution_legacy(p_kind, p_payload);

  IF v_role = 'admin' THEN
    v_route_id := nullif(v_result ->> 'route_id', '')::bigint;

    IF v_route_id IS NOT NULL THEN
      UPDATE public.routes
      SET is_approved = true,
          moderation_status = 'approved',
          moderation_note = NULL,
          moderated_by = v_actor,
          moderated_at = pg_catalog.clock_timestamp()
      WHERE id = v_route_id
        AND created_by = v_actor
        AND moderation_status = 'pending';
    END IF;

    FOR v_point IN
      SELECT value
      FROM jsonb_array_elements(coalesce(v_result -> 'points', '[]'::jsonb))
    LOOP
      IF v_point ->> 'kind' = 'terminal' THEN
        UPDATE public.terminals
        SET is_approved = true,
            moderation_status = 'approved',
            moderation_note = NULL,
            moderated_by = v_actor,
            moderated_at = pg_catalog.clock_timestamp()
        WHERE id = (v_point ->> 'id')::bigint
          AND created_by = v_actor
          AND moderation_status = 'pending';
      ELSIF v_point ->> 'kind' = 'stop' THEN
        UPDATE public.stops
        SET is_approved = true,
            moderation_status = 'approved',
            moderation_note = NULL,
            moderated_by = v_actor,
            moderated_at = pg_catalog.clock_timestamp()
        WHERE id = (v_point ->> 'id')::bigint
          AND created_by = v_actor
          AND moderation_status = 'pending';
      END IF;
    END LOOP;
  END IF;

  RETURN v_result || jsonb_build_object(
    'moderation_status',
    CASE WHEN v_role = 'admin' THEN 'approved' ELSE 'pending' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contribution(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_contribution(text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_route_management_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_entity text;
  v_entity_id text;
  v_label text;
  v_action text;
  v_category_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT role_row.role::text
  INTO v_role
  FROM public.user_roles AS role_row
  WHERE role_row.user_id = v_actor;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'moderator') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_entity := CASE TG_TABLE_NAME
    WHEN 'routes' THEN 'route'
    WHEN 'stops' THEN 'stop'
    WHEN 'terminals' THEN 'terminal'
    WHEN 'route_stops' THEN 'route_stop'
    WHEN 'transport_types' THEN 'transport_type'
    ELSE TG_TABLE_NAME
  END;

  IF TG_TABLE_NAME = 'route_stops' THEN
    v_entity_id := coalesce(NEW.route_id, OLD.route_id)::text;
    v_label := 'Route ' || v_entity_id;
    v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
      jsonb_build_object(
        'route_id', OLD.route_id,
        'stop_order', OLD.stop_order,
        'terminal_id', OLD.terminal_id,
        'stop_id', OLD.stop_id
      )
    END;
    v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
      jsonb_build_object(
        'route_id', NEW.route_id,
        'stop_order', NEW.stop_order,
        'terminal_id', NEW.terminal_id,
        'stop_id', NEW.stop_id
      )
    END;
  ELSE
    v_entity_id := coalesce(NEW.id, OLD.id)::text;
    v_label := coalesce(NEW.name, OLD.name);
    IF TG_TABLE_NAME = 'routes' THEN
      v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
        jsonb_build_object(
          'name', OLD.name,
          'transport_type_id', OLD.transport_type_id,
          'variant_id', OLD.variant_id,
          'fare_area_id', OLD.fare_area_id,
          'moderation_status', OLD.moderation_status,
          'is_approved', OLD.is_approved,
          'is_active', OLD.is_active,
          'is_banned', OLD.is_banned,
          'is_deleted', OLD.is_deleted
        )
      END;
      v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
        jsonb_build_object(
          'name', NEW.name,
          'transport_type_id', NEW.transport_type_id,
          'variant_id', NEW.variant_id,
          'fare_area_id', NEW.fare_area_id,
          'moderation_status', NEW.moderation_status,
          'is_approved', NEW.is_approved,
          'is_active', NEW.is_active,
          'is_banned', NEW.is_banned,
          'is_deleted', NEW.is_deleted
        )
      END;
    ELSIF TG_TABLE_NAME = 'stops' THEN
      v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
        jsonb_build_object(
          'name', OLD.name,
          'stop_type', OLD.stop_type,
          'latitude', OLD.latitude,
          'longitude', OLD.longitude,
          'transport_type_id', OLD.transport_type_id,
          'moderation_status', OLD.moderation_status,
          'is_approved', OLD.is_approved,
          'is_active', OLD.is_active,
          'is_banned', OLD.is_banned,
          'is_deleted', OLD.is_deleted
        )
      END;
      v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
        jsonb_build_object(
          'name', NEW.name,
          'stop_type', NEW.stop_type,
          'latitude', NEW.latitude,
          'longitude', NEW.longitude,
          'transport_type_id', NEW.transport_type_id,
          'moderation_status', NEW.moderation_status,
          'is_approved', NEW.is_approved,
          'is_active', NEW.is_active,
          'is_banned', NEW.is_banned,
          'is_deleted', NEW.is_deleted
        )
      END;
    ELSIF TG_TABLE_NAME = 'terminals' THEN
      v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
        jsonb_build_object(
          'name', OLD.name,
          'latitude', OLD.latitude,
          'longitude', OLD.longitude,
          'transport_type_id', OLD.transport_type_id,
          'moderation_status', OLD.moderation_status,
          'is_approved', OLD.is_approved,
          'is_active', OLD.is_active,
          'is_banned', OLD.is_banned,
          'is_deleted', OLD.is_deleted
        )
      END;
      v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
        jsonb_build_object(
          'name', NEW.name,
          'latitude', NEW.latitude,
          'longitude', NEW.longitude,
          'transport_type_id', NEW.transport_type_id,
          'moderation_status', NEW.moderation_status,
          'is_approved', NEW.is_approved,
          'is_active', NEW.is_active,
          'is_banned', NEW.is_banned,
          'is_deleted', NEW.is_deleted
        )
      END;
    ELSE
      v_before := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE
        jsonb_build_object('name', OLD.name, 'color', OLD.color)
      END;
      v_after := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE
        jsonb_build_object('name', NEW.name, 'color', NEW.color)
      END;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := v_entity || '_created';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := v_entity || '_deleted';
  ELSIF v_before ->> 'moderation_status' IS DISTINCT FROM
        v_after ->> 'moderation_status' THEN
    v_action := v_entity || '_' || coalesce(v_after ->> 'moderation_status', 'updated');
  ELSIF v_before ->> 'is_deleted' IS DISTINCT FROM v_after ->> 'is_deleted'
        AND v_after ->> 'is_deleted' = 'true' THEN
    v_action := v_entity || '_archived';
  ELSIF v_before ->> 'is_active' IS DISTINCT FROM v_after ->> 'is_active' THEN
    v_action := v_entity || '_availability_changed';
  ELSE
    v_action := v_entity || '_updated';
  END IF;

  SELECT category.id
  INTO v_category_id
  FROM public.admin_action_categories AS category
  WHERE category.category_key = 'route_management'
    AND category.is_active IS TRUE;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'The Route Management audit category is unavailable.';
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_user_id,
    admin_display_name,
    admin_username,
    category_id,
    action_key,
    action_title,
    description,
    target_type,
    target_id,
    target_label,
    metadata
  )
  SELECT
    v_actor,
    coalesce(
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(profile.username), ''),
      CASE WHEN v_role = 'moderator' THEN 'Moderator' ELSE 'Administrator' END
    ),
    profile.username,
    v_category_id,
    v_action,
    initcap(replace(v_action, '_', ' ')),
    initcap(replace(v_action, '_', ' ')) || ' in Route Management.',
    v_entity,
    v_entity_id,
    v_label,
    jsonb_build_object('before', v_before, 'after', v_after)
  FROM public.profiles AS profile
  WHERE profile.id = v_actor;

  IF NOT FOUND THEN
    INSERT INTO public.admin_audit_logs (
      admin_user_id,
      admin_display_name,
      category_id,
      action_key,
      action_title,
      description,
      target_type,
      target_id,
      target_label,
      metadata
    )
    VALUES (
      v_actor,
      CASE WHEN v_role = 'moderator' THEN 'Moderator' ELSE 'Administrator' END,
      v_category_id,
      v_action,
      initcap(replace(v_action, '_', ' ')),
      initcap(replace(v_action, '_', ' ')) || ' in Route Management.',
      v_entity,
      v_entity_id,
      v_label,
      jsonb_build_object('before', v_before, 'after', v_after)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_route_management_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_routes_management_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.audit_route_management_change();

CREATE TRIGGER audit_stops_management_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.stops
  FOR EACH ROW EXECUTE FUNCTION public.audit_route_management_change();

CREATE TRIGGER audit_terminals_management_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.terminals
  FOR EACH ROW EXECUTE FUNCTION public.audit_route_management_change();

CREATE TRIGGER audit_route_stops_management_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.route_stops
  FOR EACH ROW EXECUTE FUNCTION public.audit_route_management_change();

CREATE TRIGGER audit_transport_types_management_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.transport_types
  FOR EACH ROW EXECUTE FUNCTION public.audit_route_management_change();

CREATE FUNCTION public.manage_transit_record(
  p_entity_type text,
  p_action text,
  p_entity_id bigint,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_name text;
  v_point jsonb;
  v_route_stops jsonb;
  v_status text;
  v_type_id bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT role_row.role::text
  INTO v_role
  FROM public.user_roles AS role_row
  WHERE role_row.user_id = v_actor;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'moderator') THEN
    RAISE EXCEPTION 'Route Management access required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_action IN ('approve', 'reject') THEN
    IF p_entity_type NOT IN ('route', 'stop', 'terminal') THEN
      RAISE EXCEPTION 'Invalid moderation target.';
    END IF;

    v_status := CASE p_action
      WHEN 'approve' THEN 'approved'
      ELSE 'rejected'
    END;

    IF p_entity_type = 'route' THEN
      IF p_action = 'approve' AND EXISTS (
        SELECT 1
        FROM public.route_stops AS route_stop
        LEFT JOIN public.terminals AS terminal_row
          ON terminal_row.id = route_stop.terminal_id
        LEFT JOIN public.stops AS stop_row
          ON stop_row.id = route_stop.stop_id
        WHERE route_stop.route_id = p_entity_id
          AND (
            (route_stop.terminal_id IS NOT NULL AND (
              terminal_row.is_approved IS NOT TRUE
              OR terminal_row.moderation_status <> 'approved'
              OR terminal_row.is_active IS NOT TRUE
              OR terminal_row.is_deleted IS TRUE
              OR terminal_row.is_banned IS TRUE
            ))
            OR (route_stop.stop_id IS NOT NULL AND (
              stop_row.is_approved IS NOT TRUE
              OR stop_row.moderation_status <> 'approved'
              OR stop_row.is_active IS NOT TRUE
              OR stop_row.is_deleted IS TRUE
              OR stop_row.is_banned IS TRUE
            ))
          )
      ) THEN
        RAISE EXCEPTION 'Approve a route''s stops before approving the route.';
      END IF;

      UPDATE public.routes
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = CASE WHEN p_action = 'reject'
            THEN nullif(left(btrim(coalesce(p_payload ->> 'moderation_note', '')), 500), '')
            ELSE NULL
          END,
          moderated_by = v_actor,
          moderated_at = pg_catalog.clock_timestamp()
      WHERE id = p_entity_id
        AND moderation_status = 'pending'
      RETURNING name INTO v_name;
    ELSIF p_entity_type = 'stop' THEN
      UPDATE public.stops
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = CASE WHEN p_action = 'reject'
            THEN nullif(left(btrim(coalesce(p_payload ->> 'moderation_note', '')), 500), '')
            ELSE NULL
          END,
          moderated_by = v_actor,
          moderated_at = pg_catalog.clock_timestamp()
      WHERE id = p_entity_id
        AND moderation_status = 'pending'
      RETURNING name INTO v_name;
    ELSE
      UPDATE public.terminals
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = CASE WHEN p_action = 'reject'
            THEN nullif(left(btrim(coalesce(p_payload ->> 'moderation_note', '')), 500), '')
            ELSE NULL
          END,
          moderated_by = v_actor,
          moderated_at = pg_catalog.clock_timestamp()
      WHERE id = p_entity_id
        AND moderation_status = 'pending'
      RETURNING name INTO v_name;
    END IF;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Pending record not found.'
        USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
      'id', p_entity_id,
      'entityType', p_entity_type,
      'moderationStatus', v_status
    );
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Administrator access required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_entity_type = 'transport_type' THEN
    IF p_action = 'create' THEN
      v_name := left(btrim(coalesce(p_payload ->> 'name', '')), 80);
      IF v_name = ''
         OR coalesce(p_payload ->> 'color', '') !~ '^#[0-9A-Fa-f]{3,8}$' THEN
        RAISE EXCEPTION 'A valid transport type name and color are required.';
      END IF;
      INSERT INTO public.transport_types (name, color)
      VALUES (v_name, p_payload ->> 'color')
      RETURNING id INTO v_type_id;
      RETURN jsonb_build_object('id', v_type_id);
    ELSIF p_action = 'update' THEN
      v_name := left(btrim(coalesce(p_payload ->> 'name', '')), 80);
      IF v_name = ''
         OR coalesce(p_payload ->> 'color', '') !~ '^#[0-9A-Fa-f]{3,8}$' THEN
        RAISE EXCEPTION 'A valid transport type name and color are required.';
      END IF;
      UPDATE public.transport_types
      SET name = v_name,
          color = p_payload ->> 'color'
      WHERE id = p_entity_id
      RETURNING name INTO v_name;
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'Transport type not found.'
          USING ERRCODE = 'P0002';
      END IF;
      RETURN jsonb_build_object('id', p_entity_id);
    END IF;
    RAISE EXCEPTION 'Unsupported Transport Type action.';
  END IF;

  IF p_entity_type = 'route' THEN
    IF p_action = 'update' THEN
      IF p_payload ? 'name' AND
         length(left(btrim(coalesce(p_payload ->> 'name', '')), 180)) = 0 THEN
        RAISE EXCEPTION 'Route name must be between 1 and 180 characters.';
      END IF;
      IF p_payload ? 'moderation_status'
         AND p_payload ->> 'moderation_status' NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'A pending route can only be approved or rejected.';
      END IF;
      IF p_payload ->> 'moderation_status' = 'approved'
         AND EXISTS (
           SELECT 1
           FROM public.route_stops AS route_stop
           LEFT JOIN public.terminals AS terminal_row
             ON terminal_row.id = route_stop.terminal_id
           LEFT JOIN public.stops AS stop_row
             ON stop_row.id = route_stop.stop_id
           WHERE route_stop.route_id = p_entity_id
             AND (
               (route_stop.terminal_id IS NOT NULL AND (
                 terminal_row.is_approved IS NOT TRUE
                 OR terminal_row.moderation_status <> 'approved'
                 OR terminal_row.is_active IS NOT TRUE
                 OR terminal_row.is_deleted IS TRUE
                 OR terminal_row.is_banned IS TRUE
               ))
               OR (route_stop.stop_id IS NOT NULL AND (
                 stop_row.is_approved IS NOT TRUE
                 OR stop_row.moderation_status <> 'approved'
                 OR stop_row.is_active IS NOT TRUE
                 OR stop_row.is_deleted IS TRUE
                 OR stop_row.is_banned IS TRUE
               ))
             )
         ) THEN
        RAISE EXCEPTION 'Approve a route''s stops before approving the route.';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.transport_variants AS variant_row
        WHERE variant_row.id = coalesce(
          nullif(p_payload ->> 'variant_id', '')::bigint,
          (SELECT route_row.variant_id FROM public.routes AS route_row WHERE route_row.id = p_entity_id)
        )
          AND variant_row.transport_type_id = coalesce(
            nullif(p_payload ->> 'transport_type_id', '')::bigint,
            (SELECT route_row.transport_type_id FROM public.routes AS route_row WHERE route_row.id = p_entity_id)
          )
          AND variant_row.is_active IS TRUE
      ) THEN
        RAISE EXCEPTION 'The selected variant does not belong to the selected transport type.';
      END IF;
      UPDATE public.routes
      SET name = CASE WHEN p_payload ? 'name'
            THEN left(btrim(p_payload ->> 'name'), 180) ELSE name END,
          transport_type_id = CASE WHEN p_payload ? 'transport_type_id'
            THEN (p_payload ->> 'transport_type_id')::bigint ELSE transport_type_id END,
          variant_id = CASE WHEN p_payload ? 'variant_id'
            THEN (p_payload ->> 'variant_id')::bigint ELSE variant_id END,
          fare_area_id = CASE WHEN p_payload ? 'fare_area_id'
            THEN nullif(p_payload ->> 'fare_area_id', '')::bigint ELSE fare_area_id END,
          is_active = CASE WHEN p_payload ? 'is_active'
            THEN (p_payload ->> 'is_active')::boolean ELSE is_active END,
          moderation_status = CASE WHEN p_payload ? 'moderation_status'
            THEN p_payload ->> 'moderation_status' ELSE moderation_status END,
          is_approved = CASE WHEN p_payload ? 'moderation_status'
            THEN p_payload ->> 'moderation_status' = 'approved' ELSE is_approved END,
          moderation_note = CASE WHEN p_payload ? 'moderation_status'
            THEN CASE WHEN p_payload ->> 'moderation_status' = 'rejected'
              THEN nullif(left(btrim(coalesce(p_payload ->> 'moderation_note', '')), 500), '')
              ELSE NULL END
            ELSE moderation_note END,
          moderated_by = CASE WHEN p_payload ? 'moderation_status'
            THEN v_actor ELSE moderated_by END,
          moderated_at = CASE WHEN p_payload ? 'moderation_status'
            THEN pg_catalog.clock_timestamp() ELSE moderated_at END
      WHERE id = p_entity_id
        AND (
          NOT (p_payload ? 'moderation_status')
          OR moderation_status = 'pending'
        )
      RETURNING name INTO v_name;
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'Route not found.'
          USING ERRCODE = 'P0002';
      END IF;

      IF p_payload ? 'stops' THEN
        v_route_stops := p_payload -> 'stops';
        IF jsonb_typeof(v_route_stops) <> 'array'
           OR jsonb_array_length(v_route_stops) < 2
           OR jsonb_array_length(v_route_stops) > 100 THEN
          RAISE EXCEPTION 'A route needs between 2 and 100 ordered stops.';
        END IF;
        DELETE FROM public.route_stops WHERE route_id = p_entity_id;
        FOR v_point IN SELECT value FROM jsonb_array_elements(v_route_stops)
        LOOP
          IF v_point ->> 'kind' NOT IN ('terminal', 'stop')
             OR coalesce(v_point ->> 'id', '') !~ '^[1-9][0-9]*$' THEN
            RAISE EXCEPTION 'Invalid route stop.';
          END IF;
          INSERT INTO public.route_stops (
            route_id,
            stop_order,
            terminal_id,
            stop_id
          )
          VALUES (
            p_entity_id,
            (SELECT count(*)::integer + 1
             FROM public.route_stops
             WHERE route_id = p_entity_id),
            CASE WHEN v_point ->> 'kind' = 'terminal'
              THEN (v_point ->> 'id')::bigint END,
            CASE WHEN v_point ->> 'kind' = 'stop'
              THEN (v_point ->> 'id')::bigint END
          );
        END LOOP;
      END IF;
      RETURN jsonb_build_object('id', p_entity_id);
    ELSIF p_action IN ('archive', 'delete') THEN
      UPDATE public.routes
      SET is_deleted = true,
          deleted_at = coalesce(deleted_at, pg_catalog.clock_timestamp()),
          deleted_by = v_actor,
          is_active = false
      WHERE id = p_entity_id
      RETURNING name INTO v_name;
    END IF;
  ELSIF p_entity_type = 'stop' THEN
    IF p_action = 'update' THEN
      IF p_payload ? 'name'
         AND length(left(btrim(coalesce(p_payload ->> 'name', '')), 120)) = 0 THEN
        RAISE EXCEPTION 'Stop name is required.';
      END IF;
      IF p_payload ? 'stop_type'
         AND p_payload ->> 'stop_type' NOT IN ('road_stop', 'train_station') THEN
        RAISE EXCEPTION 'Invalid stop type.';
      END IF;
      IF (p_payload ? 'latitude' AND
          (p_payload ->> 'latitude')::double precision NOT BETWEEN -90 AND 90)
         OR (p_payload ? 'longitude' AND
          (p_payload ->> 'longitude')::double precision NOT BETWEEN -180 AND 180) THEN
        RAISE EXCEPTION 'Stop coordinates are invalid.';
      END IF;
      UPDATE public.stops
      SET name = CASE WHEN p_payload ? 'name'
            THEN left(btrim(p_payload ->> 'name'), 120) ELSE name END,
          description = CASE WHEN p_payload ? 'description'
            THEN nullif(left(btrim(p_payload ->> 'description'), 500), '') ELSE description END,
          stop_type = CASE WHEN p_payload ? 'stop_type'
            THEN p_payload ->> 'stop_type' ELSE stop_type END,
          latitude = CASE WHEN p_payload ? 'latitude'
            THEN (p_payload ->> 'latitude')::double precision ELSE latitude END,
          longitude = CASE WHEN p_payload ? 'longitude'
            THEN (p_payload ->> 'longitude')::double precision ELSE longitude END,
          transport_type_id = CASE WHEN p_payload ? 'transport_type_id'
            THEN (p_payload ->> 'transport_type_id')::bigint ELSE transport_type_id END,
          is_active = CASE WHEN p_payload ? 'is_active'
            THEN (p_payload ->> 'is_active')::boolean ELSE is_active END
      WHERE id = p_entity_id
      RETURNING name INTO v_name;
    ELSIF p_action IN ('archive', 'delete') THEN
      UPDATE public.stops
      SET is_deleted = true,
          deleted_at = coalesce(deleted_at, pg_catalog.clock_timestamp()),
          deleted_by = v_actor,
          is_active = false
      WHERE id = p_entity_id
      RETURNING name INTO v_name;
    END IF;
  ELSIF p_entity_type = 'terminal' THEN
    IF p_action = 'update' THEN
      IF p_payload ? 'name'
         AND length(left(btrim(coalesce(p_payload ->> 'name', '')), 120)) = 0 THEN
        RAISE EXCEPTION 'Terminal name is required.';
      END IF;
      IF (p_payload ? 'latitude' AND
          (p_payload ->> 'latitude')::double precision NOT BETWEEN -90 AND 90)
         OR (p_payload ? 'longitude' AND
          (p_payload ->> 'longitude')::double precision NOT BETWEEN -180 AND 180) THEN
        RAISE EXCEPTION 'Terminal coordinates are invalid.';
      END IF;
      UPDATE public.terminals
      SET name = CASE WHEN p_payload ? 'name'
            THEN left(btrim(p_payload ->> 'name'), 120) ELSE name END,
          latitude = CASE WHEN p_payload ? 'latitude'
            THEN (p_payload ->> 'latitude')::double precision ELSE latitude END,
          longitude = CASE WHEN p_payload ? 'longitude'
            THEN (p_payload ->> 'longitude')::double precision ELSE longitude END,
          transport_type_id = CASE WHEN p_payload ? 'transport_type_id'
            THEN (p_payload ->> 'transport_type_id')::bigint ELSE transport_type_id END,
          is_active = CASE WHEN p_payload ? 'is_active'
            THEN (p_payload ->> 'is_active')::boolean ELSE is_active END
      WHERE id = p_entity_id
      RETURNING name INTO v_name;
    ELSIF p_action IN ('archive', 'delete') THEN
      UPDATE public.terminals
      SET is_deleted = true,
          deleted_at = coalesce(deleted_at, pg_catalog.clock_timestamp()),
          deleted_by = v_actor,
          is_active = false
      WHERE id = p_entity_id
      RETURNING name INTO v_name;
    END IF;
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Record not found or action is unsupported.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('id', p_entity_id, 'entityType', p_entity_type);
END;
$$;

REVOKE ALL ON FUNCTION public.manage_transit_record(text, text, bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_transit_record(text, text, bigint, jsonb)
  TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can submit routes" ON public.routes;
DROP POLICY IF EXISTS "Authenticated users can submit stops" ON public.stops;
DROP POLICY IF EXISTS "Authenticated users can submit terminals" ON public.terminals;
DROP POLICY IF EXISTS "Owners or moderators can update routes" ON public.routes;
DROP POLICY IF EXISTS "Owners or moderators can update stops" ON public.stops;
DROP POLICY IF EXISTS "Owners or moderators can update terminals" ON public.terminals;
DROP POLICY IF EXISTS "Moderators manage route stops" ON public.route_stops;

CREATE POLICY "Registered users can update their own routes"
  ON public.routes FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.role::text = 'registered_user'
    )
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.role::text = 'registered_user'
    )
  );

CREATE POLICY "Registered users can update their own stops"
  ON public.stops FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.role::text = 'registered_user'
    )
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.role::text = 'registered_user'
    )
  );

CREATE POLICY "Registered users can update their own terminals"
  ON public.terminals FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.role::text = 'registered_user'
    )
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS role_row
      WHERE role_row.user_id = (SELECT auth.uid())
        AND role_row.role::text = 'registered_user'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.routes, public.stops, public.terminals
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.route_stops
  FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name, transport_type_id, variant_id, fare_area_id)
  ON public.routes TO authenticated;
GRANT UPDATE (name, description, stop_type, latitude, longitude, transport_type_id)
  ON public.stops TO authenticated;
GRANT UPDATE (name, latitude, longitude, transport_type_id)
  ON public.terminals TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transport_types
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.admin_action_categories (
  category_key,
  category_name,
  description,
  icon_key,
  is_active
)
VALUES
  (
    'route_management',
    'Route Management',
    'Moderation and administrative transit record changes.',
    'route',
    true
  ),
  (
    'user_management',
    'User Management',
    'Administrative user role changes.',
    'users',
    true
  )
ON CONFLICT (category_key) DO UPDATE
SET is_active = true;