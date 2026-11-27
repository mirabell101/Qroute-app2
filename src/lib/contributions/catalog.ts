import { supabase } from "@/lib/supabase";
import { getPublicMapData } from "@/lib/publicMap";
import { isPositiveSafeInteger, pointKey } from "./helpers";
import type {
  ExistingPoint,
  ExistingRoute,
  StopKind,
  TransitCatalog,
  TransportTypeOption,
  TransportVariantOption,
} from "./types";

// ==================================================
// TRANSPORT OPTIONS
// ==================================================
export async function getTransportOptions(
  currentUserId: string | null | undefined = undefined,
): Promise<{ types: TransportTypeOption[]; variants: TransportVariantOption[] }> {
  if (currentUserId === null) {
    const publicData = await getPublicMapData();
    return {
      types: publicData.transportTypes,
      variants: publicData.transportVariants,
    };
  }

  const [types, variants] = await Promise.all([
    supabase.from("transport_types").select("id, name, color").order("name"),
    supabase
      .from("transport_variants")
      .select("id, transport_type_id, code, name, fare_model")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (types.error) throw new Error(types.error.message);
  if (variants.error) throw new Error(variants.error.message);

  return {
    types: (types.data ?? []) as TransportTypeOption[],
    variants: (variants.data ?? []) as TransportVariantOption[],
  };
}

// ==================================================
// TRANSIT CATALOG RAW TYPES
// ==================================================
interface RawTerminal {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  transport_type_id: number | null;
}

interface RawStop extends RawTerminal {
  stop_type: StopKind;
}

interface RawRoute {
  id: number;
  name: string;
  transport_type_id: number;
  variant_id: number;
  route_stops: {
    stop_order: number;
    terminal_id: number | null;
    stop_id: number | null;
  }[];
}

// ==================================================
// TRANSIT CATALOG
// ==================================================
/**
 * Loads approved terminals, stops and routes. Authenticated queries apply the
 * selected transport-type filter in the database before returning records.
 */
export async function getTransitCatalog(
  currentUserId: string | null | undefined = undefined,
  transportTypeId?: number,
): Promise<TransitCatalog> {
  if (transportTypeId !== undefined && !isPositiveSafeInteger(transportTypeId)) {
    throw new Error("Invalid transport type filter.");
  }

  // Public catalog path.
  if (currentUserId === null) {
    const publicData = await getPublicMapData();
    const points = new Map<string, ExistingPoint>();

    for (const terminal of publicData.terminals) {
      points.set(pointKey("terminal", terminal.id), {
        kind: "terminal",
        id: terminal.id,
        name: terminal.name,
        latitude: terminal.latitude,
        longitude: terminal.longitude,
        stopType: "terminal",
        transportTypeId: null,
        routeIds: [],
      });
    }

    for (const stop of publicData.stops) {
      points.set(pointKey("stop", stop.id), {
        kind: "stop",
        id: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        stopType: stop.stop_type,
        transportTypeId: null,
        routeIds: [],
      });
    }

    const routes: ExistingRoute[] = [];
    for (const route of publicData.routes) {
      if (transportTypeId !== undefined && route.transport_type_id !== transportTypeId) {
        continue;
      }

      const keys = route.route_stops.flatMap((row) => {
        if (row.terminals) return [pointKey("terminal", row.terminals.id)];
        if (row.stops) return [pointKey("stop", row.stops.id)];
        return [];
      });

      if (keys.length < 2) continue;
      routes.push({
        id: route.id,
        name: route.name,
        transportTypeId: route.transport_type_id,
        variantId: route.transport_variants.id,
        keys,
      });

      for (const key of keys) {
        const point = points.get(key);
        if (point && !point.routeIds.includes(route.id)) point.routeIds.push(route.id);
      }
    }

    const publicPoints = [...points.values()];
    return {
      points:
        transportTypeId === undefined
          ? publicPoints
          : publicPoints.filter((point) => point.routeIds.length > 0),
      routes,
    };
  }

  // Authenticated catalog path.
  let terminalQuery = supabase
    .from("terminals")
    .select("id, name, latitude, longitude, transport_type_id")
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false);

  let stopQuery = supabase
    .from("stops")
    .select("id, name, stop_type, latitude, longitude, transport_type_id")
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false);

  let routeQuery = supabase
    .from("routes")
    .select("id, name, transport_type_id, variant_id, route_stops ( stop_order, terminal_id, stop_id )")
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false);

  if (transportTypeId !== undefined) {
    terminalQuery = terminalQuery.eq("transport_type_id", transportTypeId);
    stopQuery = stopQuery.eq("transport_type_id", transportTypeId);
    routeQuery = routeQuery.eq("transport_type_id", transportTypeId);
  }

  const [terminals, stops, routes] = await Promise.all([
    terminalQuery.order("name"),
    stopQuery.order("name"),
    routeQuery.order("name"),
  ]);

  if (terminals.error) throw new Error(terminals.error.message);
  if (stops.error) throw new Error(stops.error.message);
  if (routes.error) throw new Error(routes.error.message);

  const points = new Map<string, ExistingPoint>();
  for (const row of (terminals.data ?? []) as RawTerminal[]) {
    points.set(pointKey("terminal", row.id), {
      kind: "terminal",
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      stopType: "terminal",
      transportTypeId: row.transport_type_id,
      routeIds: [],
    });
  }

  for (const row of (stops.data ?? []) as RawStop[]) {
    points.set(pointKey("stop", row.id), {
      kind: "stop",
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      stopType: row.stop_type,
      transportTypeId: row.transport_type_id,
      routeIds: [],
    });
  }

  const catalogRoutes: ExistingRoute[] = [];
  for (const route of (routes.data ?? []) as unknown as RawRoute[]) {
    const ordered = [...route.route_stops].sort((a, b) => a.stop_order - b.stop_order);
    const keys: string[] = [];
    let complete = ordered.length >= 2;

    for (const row of ordered) {
      const key =
        row.terminal_id !== null
          ? pointKey("terminal", row.terminal_id)
          : row.stop_id !== null
            ? pointKey("stop", row.stop_id)
            : null;

      if (!key || !points.has(key)) {
        complete = false;
        break;
      }
      keys.push(key);
    }

    if (!complete) continue;
    catalogRoutes.push({
      id: route.id,
      name: route.name,
      transportTypeId: route.transport_type_id,
      variantId: route.variant_id,
      keys,
    });

    for (const key of keys) {
      const point = points.get(key);
      if (point && !point.routeIds.includes(route.id)) point.routeIds.push(route.id);
    }
  }

  return { points: [...points.values()], routes: catalogRoutes };
}
