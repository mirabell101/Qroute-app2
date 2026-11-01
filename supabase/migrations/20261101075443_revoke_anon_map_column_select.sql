-- Anonymous public map reads now use get_public_map_data() exclusively.
-- Remove the prior column-level Data API access to map and fare base tables;
-- the RPC returns only the approved map fields needed by visitors.
REVOKE SELECT (id, name, latitude, longitude, is_active, is_approved, is_banned, is_deleted, deleted_at)
  ON TABLE public.terminals FROM anon;
REVOKE SELECT (id, name, description, stop_type, latitude, longitude, is_active, is_approved, is_banned, is_deleted, deleted_at)
  ON TABLE public.stops FROM anon;
REVOKE SELECT (id, name, transport_type_id, variant_id, is_active, is_approved, moderation_status, is_banned, is_deleted, deleted_at, fare_area_id)
  ON TABLE public.routes FROM anon;
REVOKE SELECT (route_id, stop_order, terminal_id, stop_id)
  ON TABLE public.route_stops FROM anon;
REVOKE SELECT (id, name, color)
  ON TABLE public.transport_types FROM anon;
REVOKE SELECT (id, transport_type_id, code, name, fare_model, is_active)
  ON TABLE public.transport_variants FROM anon;
REVOKE SELECT (id, variant_id, base_fare, base_distance_km, per_km_rate, rounding_step, effective_from, effective_to, is_deleted, fare_area_id)
  ON TABLE public.fare_rules FROM anon;
REVOKE SELECT (id, fare_rule_id, lower_distance_km, upper_distance_km, per_km_rate)
  ON TABLE public.fare_rule_distance_bands FROM anon;
REVOKE SELECT (id, variant_id, passenger_category, discount_percent, effective_from, effective_to, is_deleted)
  ON TABLE public.fare_discount_rules FROM anon;
REVOKE SELECT (id, route_id, from_stop_id, to_stop_id, stored_value_fare, single_journey_fare, effective_from, effective_to, is_deleted)
  ON TABLE public.rail_fares FROM anon;
