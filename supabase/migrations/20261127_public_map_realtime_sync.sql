BEGIN;

-- ============================================================================
-- QROUTE PUBLIC MAP REALTIME INVALIDATION
--
-- Sends a lightweight notification after committed changes to the transit
-- catalogue. The payload contains only the changed table and operation.
-- Clients reload public map data through the existing read services/RPCs.
-- ============================================================================

-- Permit anonymous and signed-in map clients to receive this one private
-- Broadcast topic. There is intentionally no INSERT policy for clients.
DROP POLICY IF EXISTS "qroute_public_map_sync_read" ON realtime.messages;

CREATE POLICY "qroute_public_map_sync_read"
ON realtime.messages
FOR SELECT
TO anon, authenticated
USING (
  extension = 'broadcast'
  AND realtime.topic() = 'qroute:public-map'
);

CREATE OR REPLACE FUNCTION public.broadcast_public_map_sync_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Do not expose complete records, coordinates, descriptions, user IDs,
  -- photo paths, or moderation notes through the public map channel.
  PERFORM realtime.send(
    payload => pg_catalog.jsonb_build_object(
      'entity', TG_TABLE_NAME,
      'operation', TG_OP
    ),
    event => 'map_changed',
    topic => 'qroute:public-map',
    private => true
  );

  -- All callers are AFTER STATEMENT triggers, so no row value is returned.
  RETURN NULL;
END;
$function$;

-- Route associations and route configuration.
DROP TRIGGER IF EXISTS trg_qroute_public_map_realtime_sync ON public.route_stops;
CREATE TRIGGER trg_qroute_public_map_realtime_sync
AFTER INSERT OR UPDATE OR DELETE ON public.route_stops
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_public_map_sync_change();

DROP TRIGGER IF EXISTS trg_qroute_public_map_realtime_sync ON public.routes;
CREATE TRIGGER trg_qroute_public_map_realtime_sync
AFTER INSERT OR UPDATE OR DELETE ON public.routes
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_public_map_sync_change();

-- Approved map locations, including replacement/conversion locations.
DROP TRIGGER IF EXISTS trg_qroute_public_map_realtime_sync ON public.stops;
CREATE TRIGGER trg_qroute_public_map_realtime_sync
AFTER INSERT OR UPDATE OR DELETE ON public.stops
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_public_map_sync_change();

DROP TRIGGER IF EXISTS trg_qroute_public_map_realtime_sync ON public.terminals;
CREATE TRIGGER trg_qroute_public_map_realtime_sync
AFTER INSERT OR UPDATE OR DELETE ON public.terminals
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_public_map_sync_change();

-- Vehicle filter labels and colors are also displayed on the map.
DROP TRIGGER IF EXISTS trg_qroute_public_map_realtime_sync ON public.transport_types;
CREATE TRIGGER trg_qroute_public_map_realtime_sync
AFTER INSERT OR UPDATE OR DELETE ON public.transport_types
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_public_map_sync_change();

-- Approved point/proposal photos can become visible after moderation.
DROP TRIGGER IF EXISTS trg_qroute_public_map_realtime_sync ON public.map_images;
CREATE TRIGGER trg_qroute_public_map_realtime_sync
AFTER INSERT OR UPDATE OR DELETE ON public.map_images
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_public_map_sync_change();

COMMIT;
