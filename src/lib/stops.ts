import { supabase } from "@/lib/supabase";
import { getPublicMapData, hasMapAuthSession } from "./publicMap";

// ============================================================
// CACHE
// ============================================================

const stopMapCacheLifetime = 60_000;

let cachedStops: {
  value: Stop[];
  expiresAt: number;
} | null = null;

let stopsRequest: Promise<Stop[]> | null = null;
let stopsRequestGeneration = 0;

/** Force the next map refresh to fetch current stop visibility/status values. */
export function invalidateStopsCache(): void {
  stopsRequestGeneration += 1;
  cachedStops = null;
  stopsRequest = null;
}

// ============================================================
// TYPES
// ============================================================

export type StopType = "road_stop" | "train_station";

export interface Stop {
  id: number;
  name: string;
  description: string | null;
  stop_type: StopType;
  latitude: number;
  longitude: number;
  is_active: boolean;
  is_deleted: boolean;
  transport_type_id: number;
}

// ============================================================
// AUTHENTICATED STOP LOADING
// ============================================================

async function fetchAuthenticatedStops(): Promise<Stop[]> {
  const { data, error } = await supabase
    .from("stops")
    .select(
      `
        id,
        name,
        description,
        stop_type,
        latitude,
        longitude,
        is_active,
        is_deleted,
        transport_type_id
      `,
    )
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .eq("is_deleted", false)
    .is("deleted_at", null)
    .or("is_banned.eq.false,is_banned.is.null")
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  // Defend against unexpected/null status values in returned records.
  const records = (data ?? []) as Stop[];
  return records.filter(
    (stop: Stop) => stop.is_active === true && stop.is_deleted === false,
  );
}

// ============================================================
// GET PUBLIC STOPS
// ============================================================

export async function getStops(
  currentUserId: string | null | undefined = undefined,
): Promise<Stop[]> {
  // Logged-out visitors use the SECURITY DEFINER public map RPC.
  if (!(await hasMapAuthSession(currentUserId))) {
    const { stops } = await getPublicMapData();
    return stops.filter(
      (stop) => stop.is_active === true && stop.is_deleted === false,
    );
  }

  // Authenticated users: valid cache.
  if (cachedStops && cachedStops.expiresAt > Date.now()) {
    return cachedStops.value;
  }

  // Authenticated users: share in-flight request.
  if (!stopsRequest) {
    const requestGeneration = stopsRequestGeneration;
    const request = fetchAuthenticatedStops().then((stops) => {
      // An invalidated in-flight response must not repopulate the cache.
      if (requestGeneration === stopsRequestGeneration) {
        cachedStops = {
          value: stops,
          expiresAt: Date.now() + stopMapCacheLifetime,
        };
      }
      return stops;
    });
    stopsRequest = request;
  }

  const request = stopsRequest;
  try {
    return await request;
  } finally {
    if (stopsRequest === request) {
      stopsRequest = null;
    }
  }
}
