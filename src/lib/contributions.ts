import { supabase } from "@/lib/supabase";
import { getPublicMapData } from "@/lib/publicMap";

export type ContributionKind = "terminal" | "stop" | "route";
export type PointKind = "terminal" | "stop";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type StopKind = "road_stop" | "train_station";

export interface TransportTypeOption {
  id: number;
  name: string;
  color: string;
}

export interface TransportVariantOption {
  id: number;
  transport_type_id: number;
  code: string;
  name: string;
  fare_model: "distance" | "matrix";
}

export interface PointInput {
  kind: PointKind;
  existingId?: number | null; // set when reusing an approved terminal/stop
  transportTypeId?: number | null; // used for standalone terminals/stops
  name: string;
  description: string;
  stopType: StopKind;
  latitude: number;
  longitude: number;
}

export type ContributionInput =
  | ({ kind: "terminal" | "stop" } & PointInput)
  | {
      kind: "route";
      name: string;
      variantId: number;
      points: PointInput[];
    };

export interface SubmitResult {
  routeId: number | null;
  points: { kind: PointKind; id: number }[];
  moderationStatus: "pending" | "approved";
}

export interface MyContribution {
  key: string;
  kind: ContributionKind;
  id: number;
  name: string;
  status: ReviewStatus;
  note: string | null;
  createdAt: string;
}

// An approved, publicly visible terminal or stop that a route can reuse.
export interface ExistingPoint {
  kind: PointKind;
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  stopType: StopKind | "terminal";
  transportTypeId: number | null;
  routeIds: number[]; // approved routes that serve this point
}

// An approved route with its ordered points (as pointKey strings).
export interface ExistingRoute {
  id: number;
  name: string;
  transportTypeId: number;
  variantId: number;
  keys: string[];
}

export interface TransitCatalog {
  points: ExistingPoint[];
  routes: ExistingRoute[];
}

export const pointKey = (kind: PointKind, id: number) => `${kind}-${id}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSubmitPoint(
  value: unknown,
): value is { kind: PointKind; id: number } {
  return (
    isRecord(value) &&
    (value.kind === "terminal" || value.kind === "stop") &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id)
  );
}

function isSubmitResult(
  value: unknown,
): value is {
  route_id: number | null;
  points: { kind: PointKind; id: number }[];
  moderation_status: "pending" | "approved";
} {
  return (
    isRecord(value) &&
    (value.route_id === null ||
      (typeof value.route_id === "number" &&
        Number.isSafeInteger(value.route_id))) &&
    (value.moderation_status === "pending" ||
      value.moderation_status === "approved") &&
    Array.isArray(value.points) &&
    value.points.every(isSubmitPoint)
  );
}

export async function getTransportOptions(
  currentUserId: string | null | undefined = undefined,
): Promise<{
  types: TransportTypeOption[];
  variants: TransportVariantOption[];
}> {
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

// Approved terminals, stops and routes only. Pending, rejected, banned and
// deleted rows are never returned, so nothing unapproved can reach the builder.
// A route is included only if every one of its points is approved too.
export async function getTransitCatalog(
  currentUserId: string | null | undefined = undefined,
): Promise<TransitCatalog> {
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

    return { points: [...points.values()], routes };
  }

  const [terminals, stops, routes] = await Promise.all([
    supabase
      .from("terminals")
      .select("id, name, latitude, longitude, transport_type_id")
      .eq("is_approved", true)
      .eq("moderation_status", "approved")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .eq("is_banned", false)
      .order("name"),
    supabase
      .from("stops")
      .select("id, name, stop_type, latitude, longitude, transport_type_id")
      .eq("is_approved", true)
      .eq("moderation_status", "approved")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .eq("is_banned", false)
      .order("name"),
    supabase
      .from("routes")
      .select(
        "id, name, transport_type_id, variant_id, route_stops ( stop_order, terminal_id, stop_id )"
      )
      .eq("is_approved", true)
      .eq("moderation_status", "approved")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .eq("is_banned", false)
      .order("name"),
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
    const ordered = [...route.route_stops].sort(
      (a, b) => a.stop_order - b.stop_order
    );

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
      if (point && !point.routeIds.includes(route.id)) {
        point.routeIds.push(route.id);
      }
    }
  }

  return { points: [...points.values()], routes: catalogRoutes };
}

const pointPayload = (point: PointInput) => ({
  kind: point.kind,
  existing_id: point.existingId ?? null,
  transport_type_id: point.transportTypeId ?? null,
  name: point.name.trim(),
  description: point.description.trim(),
  stop_type: point.stopType,
  latitude: point.latitude,
  longitude: point.longitude,
});

// One atomic call: everything is saved as pending, or nothing is saved.
export async function submitContribution(
  input: ContributionInput
): Promise<SubmitResult> {
  const payload =
    input.kind === "route"
      ? {
          name: input.name.trim(),
          variant_id: input.variantId,
          points: input.points.map(pointPayload),
        }
      : pointPayload(input);

  const { data, error } = await supabase.rpc("submit_contribution", {
    p_kind: input.kind,
    p_payload: payload,
  });

  if (error) throw new Error(error.message);

  if (!isSubmitResult(data)) {
    throw new Error("Contribution service returned an invalid response.");
  }

  return {
    routeId: data.route_id,
    points: data.points,
    moderationStatus: data.moderation_status,
  };
}

interface OwnRow {
  id: number;
  name: string;
  moderation_status: ReviewStatus;
  moderation_note: string | null;
  created_at: string;
}

// The user's own submissions, including pending ones. This is the only place
// pending items are shown; they never appear on the map.
export async function getMyContributions(
  userId: string
): Promise<MyContribution[]> {
  const load = async (table: "terminals" | "stops" | "routes") => {
    const { data, error } = await supabase
      .from(table)
      .select("id, name, moderation_status, moderation_note, created_at")
      .eq("created_by", userId)
      .eq("is_deleted", false);

    if (error) throw new Error(error.message);
    return (data ?? []) as OwnRow[];
  };

  const [terminals, stops, routes] = await Promise.all([
    load("terminals"),
    load("stops"),
    load("routes"),
  ]);

  const toItem =
    (kind: ContributionKind) =>
    (row: OwnRow): MyContribution => ({
      key: `${kind}-${row.id}`,
      kind,
      id: row.id,
      name: row.name,
      status: row.moderation_status,
      note: row.moderation_note,
      createdAt: row.created_at,
    });

  return [
    ...terminals.map(toItem("terminal")),
    ...stops.map(toItem("stop")),
    ...routes.map(toItem("route")),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
