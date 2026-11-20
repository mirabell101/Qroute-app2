ALTER FUNCTION public.manage_transit_record(text, text, bigint, jsonb)
  SET SCHEMA route_management_internal;
ALTER FUNCTION route_management_internal.manage_transit_record(
  text, text, bigint, jsonb
) RENAME TO manage_transit_record_legacy;
REVOKE ALL ON FUNCTION route_management_internal.manage_transit_record_legacy(
  text, text, bigint, jsonb
) FROM PUBLIC, anon, authenticated;

-- Serialize route approval checks with route and route-stop relationship writes.
CREATE OR REPLACE FUNCTION route_management_internal.lock_route_management_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(913713, 42001);
  IF TG_LEVEL = 'STATEMENT' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION route_management_internal.lock_route_management_mutations()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION route_management_internal.lock_route_management_mutations()
  TO authenticated;

CREATE TRIGGER lock_route_management_route_updates
  BEFORE UPDATE ON public.routes
  FOR EACH STATEMENT
  EXECUTE FUNCTION route_management_internal.lock_route_management_mutations();

CREATE TRIGGER lock_route_management_route_stops
  BEFORE INSERT OR UPDATE OR DELETE ON public.route_stops
  FOR EACH ROW
  EXECUTE FUNCTION route_management_internal.lock_route_management_mutations();

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
  ELSIF v_before ->> 'is_banned' IS DISTINCT FROM v_after ->> 'is_banned' THEN
    v_action := v_entity || CASE WHEN v_after ->> 'is_banned' = 'true'
      THEN '_banned' ELSE '_unbanned' END;
  ELSIF v_before ->> 'is_active' IS DISTINCT FROM v_after ->> 'is_active' THEN
    v_action := v_entity || CASE WHEN v_after ->> 'is_active' = 'false'
      THEN '_muted' ELSE '_unmuted' END;
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
    jsonb_build_object(
      'actor_role', v_role,
      'before', v_before,
      'after', v_after
    )
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
      jsonb_build_object(
        'actor_role', v_role,
        'before', v_before,
        'after', v_after
      )
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_route_management_change()
  FROM PUBLIC, anon, authenticated;

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
  v_status text;
  v_note text;
  v_moderated_at timestamptz;
  v_conflict jsonb;
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
    v_note := CASE WHEN p_action = 'reject'
      THEN nullif(left(btrim(coalesce(p_payload ->> 'moderation_note', '')), 500), '')
      ELSE NULL
    END;
    v_moderated_at := pg_catalog.clock_timestamp();

    IF p_entity_type = 'route' THEN
      -- Use the same transaction lock as the route relationship triggers.
      PERFORM pg_catalog.pg_advisory_xact_lock(913713, 42001);

      SELECT route_row.name
      INTO v_name
      FROM public.routes AS route_row
      WHERE route_row.id = p_entity_id
        AND route_row.moderation_status = 'pending'
        AND route_row.is_approved IS FALSE
        AND coalesce(route_row.is_deleted, false) IS FALSE
        AND coalesce(route_row.is_banned, false) IS FALSE
        AND (p_action = 'reject' OR route_row.is_active IS TRUE)
      FOR UPDATE;

      IF v_name IS NULL THEN
        RAISE EXCEPTION 'Pending record not found.'
          USING ERRCODE = 'P0002';
      END IF;

      PERFORM stop_row.id
      FROM public.stops AS stop_row
      WHERE stop_row.id IN (
        SELECT route_stop.stop_id
        FROM public.route_stops AS route_stop
        WHERE route_stop.route_id = p_entity_id
          AND route_stop.stop_id IS NOT NULL
      )
      ORDER BY stop_row.id
      FOR UPDATE OF stop_row;

      PERFORM terminal_row.id
      FROM public.terminals AS terminal_row
      WHERE terminal_row.id IN (
        SELECT route_stop.terminal_id
        FROM public.route_stops AS route_stop
        WHERE route_stop.route_id = p_entity_id
          AND route_stop.terminal_id IS NOT NULL
      )
      ORDER BY terminal_row.id
      FOR UPDATE OF terminal_row;

      IF p_action = 'approve' THEN
        WITH route_points AS (
          SELECT
            'Stop'::text AS point_type,
            stop_row.id AS point_id,
            stop_row.name AS point_name,
            route_stop.route_id,
            route_stop.stop_id,
            NULL::bigint AS terminal_id
          FROM public.route_stops AS route_stop
          JOIN public.stops AS stop_row
            ON stop_row.id = route_stop.stop_id
          WHERE route_stop.route_id = p_entity_id
          UNION ALL
          SELECT
            'Terminal'::text,
            terminal_row.id,
            terminal_row.name,
            route_stop.route_id,
            NULL::bigint,
            route_stop.terminal_id
          FROM public.route_stops AS route_stop
          JOIN public.terminals AS terminal_row
            ON terminal_row.id = route_stop.terminal_id
          WHERE route_stop.route_id = p_entity_id
        )
        SELECT jsonb_build_object(
          'pointType', route_point.point_type,
          'pointId', route_point.point_id,
          'pointName', route_point.point_name,
          'routes', (
            SELECT jsonb_agg(
              jsonb_build_object('id', other_route.id, 'name', other_route.name)
              ORDER BY other_route.name, other_route.id
            )
            FROM public.route_stops AS other_link
            JOIN public.routes AS other_route
              ON other_route.id = other_link.route_id
            WHERE other_link.route_id <> p_entity_id
              AND (
                (route_point.stop_id IS NOT NULL
                  AND other_link.stop_id = route_point.stop_id)
                OR (route_point.terminal_id IS NOT NULL
                  AND other_link.terminal_id = route_point.terminal_id)
              )
          )
        )
        INTO v_conflict
        FROM route_points AS route_point
        WHERE (
          route_point.stop_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.stops AS stop_row
            WHERE stop_row.id = route_point.stop_id
              AND stop_row.moderation_status = 'pending'
          )
          OR route_point.terminal_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.terminals AS terminal_row
            WHERE terminal_row.id = route_point.terminal_id
              AND terminal_row.moderation_status = 'pending'
          )
        )
          AND EXISTS (
            SELECT 1
            FROM public.route_stops AS other_link
            WHERE other_link.route_id <> p_entity_id
              AND (
                (route_point.stop_id IS NOT NULL
                  AND other_link.stop_id = route_point.stop_id)
                OR (route_point.terminal_id IS NOT NULL
                  AND other_link.terminal_id = route_point.terminal_id)
              )
          )
        ORDER BY route_point.point_type, route_point.point_name
        LIMIT 1;

        IF v_conflict IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'route_management_shared_pending_point',
            DETAIL = v_conflict::text;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM public.route_stops AS route_stop
          LEFT JOIN public.stops AS stop_row
            ON stop_row.id = route_stop.stop_id
          LEFT JOIN public.terminals AS terminal_row
            ON terminal_row.id = route_stop.terminal_id
          WHERE route_stop.route_id = p_entity_id
            AND (
              (route_stop.stop_id IS NOT NULL AND (
                stop_row.id IS NULL
                OR stop_row.is_active IS NOT TRUE
                OR coalesce(stop_row.is_deleted, false)
                OR coalesce(stop_row.is_banned, false)
                OR NOT (
                  (stop_row.moderation_status = 'approved'
                    AND stop_row.is_approved IS TRUE)
                  OR (stop_row.moderation_status = 'pending'
                    AND stop_row.is_approved IS FALSE)
                )
              ))
              OR (route_stop.terminal_id IS NOT NULL AND (
                terminal_row.id IS NULL
                OR terminal_row.is_active IS NOT TRUE
                OR coalesce(terminal_row.is_deleted, false)
                OR coalesce(terminal_row.is_banned, false)
                OR NOT (
                  (terminal_row.moderation_status = 'approved'
                    AND terminal_row.is_approved IS TRUE)
                  OR (terminal_row.moderation_status = 'pending'
                    AND terminal_row.is_approved IS FALSE)
                )
              ))
            )
        ) THEN
          RAISE EXCEPTION 'Route points must be active, available, and eligible for moderation.';
        END IF;
      END IF;

      UPDATE public.routes
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = v_note,
          moderated_by = v_actor,
          moderated_at = v_moderated_at
      WHERE id = p_entity_id
        AND moderation_status = 'pending'
        AND is_approved IS FALSE
      RETURNING name INTO v_name;

      UPDATE public.stops AS stop_row
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = v_note,
          moderated_by = v_actor,
          moderated_at = v_moderated_at
      WHERE stop_row.moderation_status = 'pending'
        AND (p_action = 'reject' OR stop_row.is_active IS TRUE)
        AND coalesce(stop_row.is_deleted, false) IS FALSE
        AND coalesce(stop_row.is_banned, false) IS FALSE
        AND EXISTS (
          SELECT 1 FROM public.route_stops AS route_stop
          WHERE route_stop.route_id = p_entity_id
            AND route_stop.stop_id = stop_row.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.route_stops AS other_link
          WHERE other_link.route_id <> p_entity_id
            AND other_link.stop_id = stop_row.id
        );

      UPDATE public.terminals AS terminal_row
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = v_note,
          moderated_by = v_actor,
          moderated_at = v_moderated_at
      WHERE terminal_row.moderation_status = 'pending'
        AND (p_action = 'reject' OR terminal_row.is_active IS TRUE)
        AND coalesce(terminal_row.is_deleted, false) IS FALSE
        AND coalesce(terminal_row.is_banned, false) IS FALSE
        AND EXISTS (
          SELECT 1 FROM public.route_stops AS route_stop
          WHERE route_stop.route_id = p_entity_id
            AND route_stop.terminal_id = terminal_row.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.route_stops AS other_link
          WHERE other_link.route_id <> p_entity_id
            AND other_link.terminal_id = terminal_row.id
        );
    ELSIF p_entity_type = 'stop' THEN
      UPDATE public.stops
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = v_note,
          moderated_by = v_actor,
          moderated_at = v_moderated_at
      WHERE id = p_entity_id
        AND moderation_status = 'pending'
        AND is_approved IS FALSE
        AND coalesce(is_deleted, false) IS FALSE
        AND coalesce(is_banned, false) IS FALSE
        AND (p_action = 'reject' OR is_active IS TRUE)
      RETURNING name INTO v_name;
    ELSE
      UPDATE public.terminals
      SET moderation_status = v_status,
          is_approved = (p_action = 'approve'),
          moderation_note = v_note,
          moderated_by = v_actor,
          moderated_at = v_moderated_at
      WHERE id = p_entity_id
        AND moderation_status = 'pending'
        AND is_approved IS FALSE
        AND coalesce(is_deleted, false) IS FALSE
        AND coalesce(is_banned, false) IS FALSE
        AND (p_action = 'reject' OR is_active IS TRUE)
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

  IF p_action IN ('mute', 'unmute', 'ban', 'unban') THEN
    IF p_entity_type NOT IN ('route', 'stop', 'terminal') THEN
      RAISE EXCEPTION 'Invalid map information target.';
    END IF;

    IF p_entity_type = 'route' THEN
      IF p_action IN ('mute', 'unmute') THEN
        UPDATE public.routes
        SET is_active = (p_action = 'unmute')
        WHERE id = p_entity_id
          AND coalesce(is_deleted, false) IS FALSE
          AND is_active IS DISTINCT FROM (p_action = 'unmute')
        RETURNING name INTO v_name;
        IF v_name IS NULL THEN
          SELECT name INTO v_name FROM public.routes
          WHERE id = p_entity_id
            AND coalesce(is_deleted, false) IS FALSE
            AND is_active IS NOT DISTINCT FROM (p_action = 'unmute');
        END IF;
      ELSE
        UPDATE public.routes
        SET is_banned = (p_action = 'ban')
        WHERE id = p_entity_id
          AND coalesce(is_deleted, false) IS FALSE
          AND is_banned IS DISTINCT FROM (p_action = 'ban')
        RETURNING name INTO v_name;
        IF v_name IS NULL THEN
          SELECT name INTO v_name FROM public.routes
          WHERE id = p_entity_id
            AND coalesce(is_deleted, false) IS FALSE
            AND is_banned IS NOT DISTINCT FROM (p_action = 'ban');
        END IF;
      END IF;
    ELSIF p_entity_type = 'stop' THEN
      IF p_action IN ('mute', 'unmute') THEN
        UPDATE public.stops
        SET is_active = (p_action = 'unmute')
        WHERE id = p_entity_id
          AND coalesce(is_deleted, false) IS FALSE
          AND is_active IS DISTINCT FROM (p_action = 'unmute')
        RETURNING name INTO v_name;
        IF v_name IS NULL THEN
          SELECT name INTO v_name FROM public.stops
          WHERE id = p_entity_id
            AND coalesce(is_deleted, false) IS FALSE
            AND is_active IS NOT DISTINCT FROM (p_action = 'unmute');
        END IF;
      ELSE
        UPDATE public.stops
        SET is_banned = (p_action = 'ban')
        WHERE id = p_entity_id
          AND coalesce(is_deleted, false) IS FALSE
          AND is_banned IS DISTINCT FROM (p_action = 'ban')
        RETURNING name INTO v_name;
        IF v_name IS NULL THEN
          SELECT name INTO v_name FROM public.stops
          WHERE id = p_entity_id
            AND coalesce(is_deleted, false) IS FALSE
            AND is_banned IS NOT DISTINCT FROM (p_action = 'ban');
        END IF;
      END IF;
    ELSE
      IF p_action IN ('mute', 'unmute') THEN
        UPDATE public.terminals
        SET is_active = (p_action = 'unmute')
        WHERE id = p_entity_id
          AND coalesce(is_deleted, false) IS FALSE
          AND is_active IS DISTINCT FROM (p_action = 'unmute')
        RETURNING name INTO v_name;
        IF v_name IS NULL THEN
          SELECT name INTO v_name FROM public.terminals
          WHERE id = p_entity_id
            AND coalesce(is_deleted, false) IS FALSE
            AND is_active IS NOT DISTINCT FROM (p_action = 'unmute');
        END IF;
      ELSE
        UPDATE public.terminals
        SET is_banned = (p_action = 'ban')
        WHERE id = p_entity_id
          AND coalesce(is_deleted, false) IS FALSE
          AND is_banned IS DISTINCT FROM (p_action = 'ban')
        RETURNING name INTO v_name;
        IF v_name IS NULL THEN
          SELECT name INTO v_name FROM public.terminals
          WHERE id = p_entity_id
            AND coalesce(is_deleted, false) IS FALSE
            AND is_banned IS NOT DISTINCT FROM (p_action = 'ban');
        END IF;
      END IF;
    END IF;

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Record not found or unavailable.'
        USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
      'id', p_entity_id,
      'entityType', p_entity_type,
      'action', p_action
    );
  END IF;

  IF p_action = 'update' AND p_payload ? 'moderation_status' THEN
    RAISE EXCEPTION 'Use the moderation action to change moderation status.'
      USING ERRCODE = '42501';
  END IF;

  RETURN route_management_internal.manage_transit_record_legacy(
    p_entity_type,
    p_action,
    p_entity_id,
    p_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_transit_record(text, text, bigint, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_transit_record(text, text, bigint, jsonb)
  TO authenticated;