import { supabase } from "@/lib/supabase";
import { buildRouteMapIndex } from "./routeMap";
import type {
  RouteMapIndex,
  RouteMapRouteRecord,
} from "./routeMap";
import {
  getPublicMapData,
  hasMapAuthSession,
} from "./publicMap";

const routeMapCacheLifetime = 60_000;

let cachedRouteMapIndex: {
  value: RouteMapIndex;
  expiresAt: number;
} | null = null;

let routeMapIndexRequest: Promise<RouteMapIndex> | null = null;
let routeMapIndexRequestGeneration = 0;

/** Force the next map refresh to rebuild the eligible route map index. */
export function invalidateRouteMapIndexCache(): void {
  routeMapIndexRequestGeneration += 1;
  cachedRouteMapIndex = null;
  routeMapIndexRequest = null;
}

export type PointKind = "terminal" | "stop";
export type StopType = "terminal" | "road_stop" | "train_station";
export type FareModel = "distance" | "matrix";

// One entry in a route's ordered sequence: a terminal OR a stop.
export interface RouteStop {
  route_id: number;
  stop_order: number;
  kind: PointKind;
  ref_id: number;
  name: string;
  latitude: number;
  longitude: number;
  stop_type: StopType;
  description: string | null;
}

export interface RouteDetails {
  id: number;
  name: string;
  transport_type_id: number;
  created_by: string | null;
  is_active: boolean;
  is_deleted: boolean;
  is_approved: boolean;
  moderation_status: "pending" | "approved" | "rejected";
  transport_types: {
    name: string;
    color: string;
  };
  transport_variants: {
    id: number;
    code: string;
    name: string;
    fare_model: FareModel;
  };
  route_stops: RouteStop[];
}

interface ApprovalAndVisibilityFlag {
  is_active: boolean;
  is_deleted: boolean;
  is_approved?: boolean;
}

interface RawPoint extends ApprovalAndVisibilityFlag {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  stop_type?: "road_stop" | "train_station";
  description?: string | null;
}

interface RawRouteStop {
  route_id: number;
  stop_order: number;
  terminals: RawPoint | null;
  stops: RawPoint | null;
}

/**
 * A route stop is visible only when exactly one related location exists,
 * that location is approved, active, and explicitly not deleted.
 */
function hasEligibleRoutePoint(row: RawRouteStop): boolean {
  // A route_stops row must reference exactly one location kind.
  if (row.terminals !== null && row.stops === null) {
    return (
      row.terminals.is_approved === true &&
      row.terminals.is_active === true &&
      row.terminals.is_deleted === false
    );
  }

  if (row.stops !== null && row.terminals === null) {
    return (
      row.stops.is_approved === true &&
      row.stops.is_active === true &&
      row.stops.is_deleted === false
    );
  }

  return false;
}

function hasEligiblePublicRoutePoint(row: RawRouteStop): boolean {
  if (row.terminals !== null && row.stops === null) {
    return row.terminals.is_active === true && row.terminals.is_deleted === false;
  }

  if (row.stops !== null && row.terminals === null) {
    return row.stops.is_active === true && row.stops.is_deleted === false;
  }

  return false;
}

function isEligiblePublicRouteRecord(
  route: Pick<RouteMapRouteRecord, "is_active" | "is_deleted" | "route_stops">,
): boolean {
  return (
    route.is_active === true &&
    route.is_deleted === false &&
    Array.isArray(route.route_stops) &&
    // A single unavailable stop must not invalidate an otherwise usable route.
    route.route_stops.some(hasEligiblePublicRoutePoint)
  );
}

// ============================================================
// AUTHENTICATED ROUTE MAP INDEX
// ============================================================

async function fetchAuthenticatedRouteMapIndex(): Promise<RouteMapIndex> {
  const { data, error } = await supabase
    .from("routes")
    .select(
      `
        id,
        name,
        transport_type_id,
        is_active,
        is_deleted,
        transport_types ( name, color ),
        route_stops (
          route_id,
          stop_order,
          terminals (
            id, name, latitude, longitude,
            is_active, is_deleted, is_approved
          ),
          stops (
            id, name, description, stop_type, latitude, longitude,
            is_active, is_deleted, is_approved
          )
        )
      `,
    )
    .eq("is_active", true)
    .eq("is_deleted", false)
    .is("deleted_at", null)
    .eq("is_banned", false)
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  // Keep an eligible route when it has at least one eligible location.
  // Invalid/inactive/deleted associated locations are skipped individually
  // by buildRouteMapIndex(), not used to reject the whole route.
  const records = ((data ?? []) as unknown as RouteMapRouteRecord[]).filter(
    (record) =>
      record.is_active === true &&
      record.is_deleted === false &&
      record.route_stops.some(hasEligibleRoutePoint),
  );

  return buildRouteMapIndex(records);
}

export async function getRouteMapIndex(
  currentUserId: string | null | undefined = undefined,
): Promise<RouteMapIndex> {
  if (!(await hasMapAuthSession(currentUserId))) {
    const { routes } = await getPublicMapData();
    const visibleRoutes = routes.filter(isEligiblePublicRouteRecord);
    return buildRouteMapIndex(visibleRoutes);
  }

  if (
    cachedRouteMapIndex &&
    cachedRouteMapIndex.expiresAt > Date.now()
  ) {
    return cachedRouteMapIndex.value;
  }

  if (!routeMapIndexRequest) {
    const requestGeneration = routeMapIndexRequestGeneration;
    const request = fetchAuthenticatedRouteMapIndex().then((index) => {
      if (requestGeneration === routeMapIndexRequestGeneration) {
        cachedRouteMapIndex = {
          value: index,
          expiresAt: Date.now() + routeMapCacheLifetime,
        };
      }
      return index;
    });
    routeMapIndexRequest = request;
  }

  const request = routeMapIndexRequest;
  try {
    return await request;
  } finally {
    if (routeMapIndexRequest === request) {
      routeMapIndexRequest = null;
    }
  }
}

// ============================================================
// ROUTE DETAILS
// ============================================================

interface RawRouteDetailsPoint extends ApprovalAndVisibilityFlag {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  stop_type?: "road_stop" | "train_station";
  description?: string | null;
}

interface RawRouteDetailsStop {
  route_id: number;
  stop_order: number;
  terminals: RawRouteDetailsPoint | null;
  stops: RawRouteDetailsPoint | null;
}

interface RawRouteDetails extends Omit<RouteDetails, "route_stops" | "created_by"> {
  route_stops: RawRouteDetailsStop[];
}

// created_by is not readable by logged-out visitors. It is fetched separately
// only when signed in, so guests receive null and owner-only actions stay hidden.
async function getRouteOwnerId(routeId: number): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data, error } = await supabase
    .from("routes")
    .select("created_by")
    .eq("id", routeId)
    .maybeSingle();

  if (error) return null;

  return (
    (data as { created_by: string | null } | null)?.created_by ?? null
  );
}

function toRouteStopRows(
  rows: RawRouteDetailsStop[],
  routeId: number,
): RouteStop[] {
  return rows
    .flatMap((row): RouteStop[] => {
      const terminal = row.terminals;
      const stop = row.stops;

      const terminalEligible =
        terminal !== null &&
        stop === null &&
        terminal.is_active === true &&
        terminal.is_deleted === false &&
        (terminal.is_approved === undefined || terminal.is_approved === true);

      const stopEligible =
        stop !== null &&
        terminal === null &&
        stop.is_active === true &&
        stop.is_deleted === false &&
        (stop.is_approved === undefined || stop.is_approved === true);

      if (terminalEligible && terminal) {
        return [
          {
            route_id: row.route_id,
            stop_order: row.stop_order,
            kind: "terminal",
            ref_id: terminal.id,
            name: terminal.name,
            latitude: terminal.latitude,
            longitude: terminal.longitude,
            stop_type: "terminal",
            description: null,
          },
        ];
      }

      if (stopEligible && stop) {
        return [
          {
            route_id: row.route_id,
            stop_order: row.stop_order,
            kind: "stop",
            ref_id: stop.id,
            name: stop.name,
            latitude: stop.latitude,
            longitude: stop.longitude,
            stop_type: stop.stop_type ?? "road_stop",
            description: stop.description ?? null,
          },
        ];
      }

      return [];
    })
    .filter((point) => point.route_id === routeId)
    .sort((a, b) => a.stop_order - b.stop_order);
}

export async function getRouteDetails(
  routeId: number,
  currentUserId: string | null | undefined = undefined,
): Promise<RouteDetails> {
  if (!(await hasMapAuthSession(currentUserId))) {
    const { routes } = await getPublicMapData();
    const route = routes.find(
      (item) =>
        item.id === routeId &&
        item.is_active === true &&
        item.is_deleted === false,
    );

    if (!route || route.is_active !== true || route.is_deleted !== false) {
      throw new Error("This route isn't available yet.");
    }

    // Inactive/deleted points are omitted individually. Remaining eligible
    // stops retain their original stop_order, so route geometry connects the
    // eligible locations on either side of an omitted location.
    const routeStops = toRouteStopRows(route.route_stops, route.id);
    if (routeStops.length === 0) {
      throw new Error("This route has no eligible stops to draw.");
    }

    return {
      id: route.id,
      name: route.name,
      transport_type_id: route.transport_type_id,
      created_by: null,
      is_active: route.is_active,
      is_deleted: route.is_deleted,
      is_approved: true,
      moderation_status: "approved",
      transport_types: route.transport_types,
      transport_variants: route.transport_variants,
      route_stops: routeStops,
    };
  }

  const { data, error } = await supabase
    .from("routes")
    .select(
      `
        id,
        name,
        transport_type_id,
        is_active,
        is_deleted,
        is_approved,
        moderation_status,
        transport_types ( name, color ),
        transport_variants ( id, code, name, fare_model ),
        route_stops (
          route_id,
          stop_order,
          terminals (
            id, name, latitude, longitude,
            is_active, is_deleted, is_approved
          ),
          stops (
            id, name, description, stop_type, latitude, longitude,
            is_active, is_deleted, is_approved
          )
        )
      `,
    )
    .eq("id", routeId)
    .eq("is_active", true)
    .eq("is_deleted", false)
    .is("deleted_at", null)
    .eq("is_banned", false)
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const raw = data as unknown as RawRouteDetails;

  if (
    raw.is_active !== true ||
    raw.is_deleted !== false ||
    raw.route_stops.length === 0
  ) {
    throw new Error("This route isn't available yet.");
  }

  // Exclude unavailable route locations without invalidating the route.
  const points = toRouteStopRows(raw.route_stops, raw.id);
  if (points.length === 0) {
    throw new Error("This route has no eligible stops to draw.");
  }

  const createdBy = await getRouteOwnerId(routeId);

  return {
    ...raw,
    created_by: createdBy,
    route_stops: points,
  };
}

// Kept so any other file importing it still works.
export async function getRouteStops(routeId: number): Promise<RouteStop[]> {
  return (await getRouteDetails(routeId)).route_stops;
}
