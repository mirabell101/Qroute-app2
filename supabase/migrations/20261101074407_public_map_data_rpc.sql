-- Read-only public map data for the Supabase anon role.
-- The function owner can bypass RLS, so keep the query static, explicitly
-- filter every public record, return only map fields, and grant execution only
-- to anon. This does not grant anon access to the underlying tables.
CREATE OR REPLACE FUNCTION public.get_public_map_data()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH public_terminals AS MATERIALIZED (
    SELECT t.id, t.name, t.latitude, t.longitude, t.is_active
    FROM public.terminals AS t
    WHERE t.is_approved IS TRUE
      AND t.moderation_status = 'approved'
      AND t.is_active IS TRUE
      AND COALESCE(t.is_deleted, false) = false
      AND t.deleted_at IS NULL
      AND COALESCE(t.is_banned, false) = false
  ),
  public_stops AS MATERIALIZED (
    SELECT s.id, s.name, s.description, s.stop_type,
           s.latitude, s.longitude, s.is_active
    FROM public.stops AS s
    WHERE s.is_approved IS TRUE
      AND s.moderation_status = 'approved'
      AND s.is_active IS TRUE
      AND COALESCE(s.is_deleted, false) = false
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_banned, false) = false
  ),
  candidate_routes AS MATERIALIZED (
    SELECT r.id, r.name, r.transport_type_id, r.variant_id, r.fare_area_id
    FROM public.routes AS r
    WHERE r.is_approved IS TRUE
      AND r.moderation_status = 'approved'
      AND r.is_active IS TRUE
      AND COALESCE(r.is_deleted, false) = false
      AND r.deleted_at IS NULL
      AND COALESCE(r.is_banned, false) = false
      AND EXISTS (
        SELECT 1
        FROM public.transport_types AS tt
        WHERE tt.id = r.transport_type_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.transport_variants AS v
        WHERE v.id = r.variant_id
          AND v.is_active IS TRUE
      )
  ),
  visible_routes AS MATERIALIZED (
    SELECT cr.*
    FROM candidate_routes AS cr
    WHERE EXISTS (
      SELECT 1
      FROM public.route_stops AS rs
      WHERE rs.route_id = cr.id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM public.route_stops AS rs
        WHERE rs.route_id = cr.id
          AND NOT (
            (
              rs.terminal_id IS NOT NULL
              AND rs.stop_id IS NULL
              AND EXISTS (
                SELECT 1 FROM public_terminals AS t WHERE t.id = rs.terminal_id
              )
            )
            OR (
              rs.stop_id IS NOT NULL
              AND rs.terminal_id IS NULL
              AND EXISTS (
                SELECT 1 FROM public_stops AS s WHERE s.id = rs.stop_id
              )
            )
          )
      )
  ),
  visible_route_stops AS MATERIALIZED (
    SELECT rs.route_id, rs.stop_order, rs.terminal_id, rs.stop_id
    FROM public.route_stops AS rs
    JOIN visible_routes AS vr ON vr.id = rs.route_id
  ),
  public_variants AS MATERIALIZED (
    SELECT v.id, v.transport_type_id, v.code, v.name, v.fare_model
    FROM public.transport_variants AS v
    WHERE v.is_active IS TRUE
      AND EXISTS (
        SELECT 1
        FROM visible_routes AS vr
        WHERE vr.transport_type_id = v.transport_type_id
      )
  ),
  public_fare_rules AS MATERIALIZED (
    SELECT fr.id, fr.variant_id, fr.fare_area_id, fr.base_fare,
           fr.base_distance_km, fr.per_km_rate, fr.rounding_step,
           fr.effective_from, fr.effective_to
    FROM public.fare_rules AS fr
    WHERE COALESCE(fr.is_deleted, false) = false
      AND EXISTS (
        SELECT 1
        FROM public_variants AS pv
        WHERE pv.id = fr.variant_id
      )
      AND EXISTS (
        SELECT 1
        FROM visible_routes AS vr
        WHERE vr.fare_area_id IS NOT NULL
          AND vr.fare_area_id = fr.fare_area_id
      )
  )
  SELECT pg_catalog.jsonb_build_object(
    'terminals', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', t.id, 'name', t.name, 'latitude', t.latitude,
          'longitude', t.longitude, 'is_active', t.is_active
        ) ORDER BY t.id
      )
      FROM public_terminals AS t
    ), '[]'::pg_catalog.jsonb),
    'stops', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', s.id, 'name', s.name, 'description', s.description,
          'stop_type', s.stop_type, 'latitude', s.latitude,
          'longitude', s.longitude, 'is_active', s.is_active
        ) ORDER BY s.id
      )
      FROM public_stops AS s
    ), '[]'::pg_catalog.jsonb),
    'routes', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', vr.id,
          'name', vr.name,
          'transport_type_id', vr.transport_type_id,
          'fare_area_id', vr.fare_area_id,
          'transport_types', pg_catalog.jsonb_build_object(
            'name', tt.name, 'color', tt.color
          ),
          'transport_variants', pg_catalog.jsonb_build_object(
            'id', v.id, 'code', v.code, 'name', v.name,
            'fare_model', v.fare_model
          ),
          'route_stops', (
            SELECT COALESCE(pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'route_id', vrs.route_id,
                'stop_order', vrs.stop_order,
                'terminals', CASE WHEN t.id IS NULL THEN NULL ELSE
                  pg_catalog.jsonb_build_object(
                    'id', t.id, 'name', t.name, 'latitude', t.latitude,
                    'longitude', t.longitude, 'is_active', t.is_active
                  ) END,
                'stops', CASE WHEN s.id IS NULL THEN NULL ELSE
                  pg_catalog.jsonb_build_object(
                    'id', s.id, 'name', s.name, 'description', s.description,
                    'stop_type', s.stop_type, 'latitude', s.latitude,
                    'longitude', s.longitude, 'is_active', s.is_active
                  ) END
              ) ORDER BY vrs.stop_order
            ), '[]'::pg_catalog.jsonb)
            FROM visible_route_stops AS vrs
            LEFT JOIN public_terminals AS t ON t.id = vrs.terminal_id
            LEFT JOIN public_stops AS s ON s.id = vrs.stop_id
            WHERE vrs.route_id = vr.id
          )
        ) ORDER BY vr.name, vr.id
      )
      FROM visible_routes AS vr
      JOIN public.transport_types AS tt ON tt.id = vr.transport_type_id
      JOIN public.transport_variants AS v
        ON v.id = vr.variant_id AND v.is_active IS TRUE
    ), '[]'::pg_catalog.jsonb),
    'transportTypes', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', tt.id, 'name', tt.name, 'color', tt.color)
        ORDER BY tt.id
      )
      FROM public.transport_types AS tt
      WHERE EXISTS (
        SELECT 1 FROM visible_routes AS vr WHERE vr.transport_type_id = tt.id
      )
    ), '[]'::pg_catalog.jsonb),
    'transportVariants', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', pv.id, 'transport_type_id', pv.transport_type_id,
          'code', pv.code, 'name', pv.name, 'fare_model', pv.fare_model
        ) ORDER BY pv.name, pv.id
      )
      FROM public_variants AS pv
    ), '[]'::pg_catalog.jsonb),
    'fareRules', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', fr.id, 'variant_id', fr.variant_id,
          'fare_area_id', fr.fare_area_id, 'base_fare', fr.base_fare,
          'base_distance_km', fr.base_distance_km, 'per_km_rate', fr.per_km_rate,
          'rounding_step', fr.rounding_step,
          'effective_from', fr.effective_from, 'effective_to', fr.effective_to
        ) ORDER BY fr.variant_id, fr.fare_area_id, fr.effective_from DESC
      )
      FROM public_fare_rules AS fr
    ), '[]'::pg_catalog.jsonb),
    'fareRuleDistanceBands', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', b.id, 'fare_rule_id', b.fare_rule_id,
          'lower_distance_km', b.lower_distance_km,
          'upper_distance_km', b.upper_distance_km,
          'per_km_rate', b.per_km_rate
        ) ORDER BY b.fare_rule_id, b.lower_distance_km
      )
      FROM public.fare_rule_distance_bands AS b
      WHERE EXISTS (
        SELECT 1 FROM public_fare_rules AS fr WHERE fr.id = b.fare_rule_id
      )
    ), '[]'::pg_catalog.jsonb),
    'fareDiscountRules', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', d.id, 'variant_id', d.variant_id,
          'passenger_category', d.passenger_category,
          'discount_percent', d.discount_percent,
          'effective_from', d.effective_from, 'effective_to', d.effective_to
        ) ORDER BY d.variant_id, d.passenger_category, d.effective_from DESC
      )
      FROM public.fare_discount_rules AS d
      WHERE COALESCE(d.is_deleted, false) = false
        AND EXISTS (SELECT 1 FROM public_variants AS pv WHERE pv.id = d.variant_id)
    ), '[]'::pg_catalog.jsonb),
    'railFares', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', rf.id, 'route_id', rf.route_id,
          'from_stop_id', rf.from_stop_id, 'to_stop_id', rf.to_stop_id,
          'stored_value_fare', rf.stored_value_fare,
          'single_journey_fare', rf.single_journey_fare,
          'effective_from', rf.effective_from, 'effective_to', rf.effective_to
        ) ORDER BY rf.route_id, rf.from_stop_id, rf.to_stop_id, rf.effective_from DESC
      )
      FROM public.rail_fares AS rf
      WHERE COALESCE(rf.is_deleted, false) = false
        AND EXISTS (
          SELECT 1
          FROM visible_route_stops AS from_point
          WHERE from_point.route_id = rf.route_id
            AND from_point.stop_id = rf.from_stop_id
        )
        AND EXISTS (
          SELECT 1
          FROM visible_route_stops AS to_point
          WHERE to_point.route_id = rf.route_id
            AND to_point.stop_id = rf.to_stop_id
        )
    ), '[]'::pg_catalog.jsonb)
  );
$function$;

COMMENT ON FUNCTION public.get_public_map_data() IS
  'Read-only allowlisted approved transit map data for anonymous visitors; underlying table access remains restricted.';

REVOKE ALL PRIVILEGES ON FUNCTION public.get_public_map_data()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_map_data() TO anon;
