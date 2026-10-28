import { supabase } from "@/lib/supabase";
import { buildRouteMapIndex } from "./routeMap";
import type { RouteMapIndex, RouteMapRouteRecord } from "./routeMap";

export type PointKind = "terminal" | "stop";
export type StopType = "terminal" | "road_stop" | "train_station";
export type FareModel = "distance" | "matrix";

// One entry in a route's ordered sequence: a terminal OR a stop.
export interface RouteStop {
  route_id: number;
  stop_order: number;
  kind: PointKind;
  ref_id: number; // terminals.id when kind = "terminal", stops.id when "stop"
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
  fare_area_id: number | null;
  created_by: string | null;
  is_approved: boolean;
  moderation_status: "pending" | "approved" | "rejected";
  transport_types: { name: string; color: string };
  transport_variants: {
    id: number;
    code: string;
    name: string;
    fare_model: FareModel;
  };
  route_stops: RouteStop[];
}

export async function getRouteMapIndex(): Promise<RouteMapIndex> {
  const { data, error } = await supabase
    .from("routes")
    .select(
      `
      id,
      name,
      transport_type_id,
      transport_types ( name, color ),
      route_stops (
        route_id,
        stop_order,
        terminals ( id, name, latitude, longitude, is_active ),
        stops ( id, name, description, stop_type, latitude, longitude )
      )
    `
    )
    .eq("is_active", true)
    .eq("is_deleted", false)
    .eq("is_banned", false)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return buildRouteMapIndex((data ?? []) as unknown as RouteMapRouteRecord[]);
}

interface RawPoint {
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

interface RawRoute extends Omit<RouteDetails, "route_stops" | "created_by"> {
  route_stops: RawRouteStop[];
}

// created_by is not readable by logged-out visitors (anon has no grant on it),
// so it is fetched separately and only when someone is signed in. Visitors get
// null, which simply hides owner-only actions like "Edit route".
async function getRouteOwnerId(routeId: number): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data, error } = await supabase
    .from("routes")
    .select("created_by")
    .eq("id", routeId)
    .maybeSingle();

  if (error) return null;

  return (data as { created_by: string | null } | null)?.created_by ?? null;
}

export async function getRouteDetails(
  routeId: number
): Promise<RouteDetails> {
  const { data, error } = await supabase
    .from("routes")
    .select(
      `
      id,
      name,
      transport_type_id,
      fare_area_id,
      is_approved,
      moderation_status,
      transport_types ( name, color ),
      transport_variants ( id, code, name, fare_model ),
      route_stops (
        route_id,
        stop_order,
        terminals ( id, name, latitude, longitude ),
        stops ( id, name, description, stop_type, latitude, longitude )
      )
    `
    )
    .eq("id", routeId)
    .eq("is_deleted", false)
    .single();

  if (error) throw new Error(error.message);

  const raw = data as unknown as RawRoute;

  const points: RouteStop[] = raw.route_stops
    .flatMap((row): RouteStop[] => {
      if (row.terminals) {
        return [
          {
            route_id: row.route_id,
            stop_order: row.stop_order,
            kind: "terminal",
            ref_id: row.terminals.id,
            name: row.terminals.name,
            latitude: row.terminals.latitude,
            longitude: row.terminals.longitude,
            stop_type: "terminal",
            description: null,
          },
        ];
      }

      // A point hidden by moderation (RLS) comes back null and is skipped.
      if (row.stops) {
        return [
          {
            route_id: row.route_id,
            stop_order: row.stop_order,
            kind: "stop",
            ref_id: row.stops.id,
            name: row.stops.name,
            latitude: row.stops.latitude,
            longitude: row.stops.longitude,
            stop_type: row.stops.stop_type ?? "road_stop",
            description: row.stops.description ?? null,
          },
        ];
      }

      return [];
    })
    .sort((a, b) => a.stop_order - b.stop_order);

  const createdBy = await getRouteOwnerId(routeId);

  return { ...raw, created_by: createdBy, route_stops: points };
}

// Kept so any other file importing it still works.
export async function getRouteStops(routeId: number): Promise<RouteStop[]> {
  return (await getRouteDetails(routeId)).route_stops;
}