
import { supabase } from "@/lib/supabase";
import {
  getPublicMapData,
  hasMapAuthSession,
} from "./publicMap";

// ============================================================
// CACHE
// ============================================================

const stopMapCacheLifetime = 60_000;

let cachedStops: {
  value: Stop[];
  expiresAt: number;
} | null = null;

let stopsRequest: Promise<Stop[]> | null = null;

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
  transport_type_id: number;
}

// ============================================================
// AUTHENTICATED STOP LOADING
// ============================================================

async function fetchAuthenticatedStops(): Promise<Stop[]> {
  const { data, error } = await supabase
    .from("stops")
    .select(`
      id,
      name,
      description,
      stop_type,
      latitude,
      longitude,
      is_active,
      transport_type_id
    `)
    .eq("is_approved", true)
    .eq("moderation_status", "approved")
    .eq("is_active", true)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .is("deleted_at", null)
    .or("is_banned.eq.false,is_banned.is.null")
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

// ============================================================
// GET PUBLIC STOPS
// ============================================================

export async function getStops(
  currentUserId: string | null | undefined = undefined,
): Promise<Stop[]> {
  // ----------------------------------------------------------
  // LOGGED-OUT VISITORS
  // ----------------------------------------------------------
  //
  // Use the existing SECURITY DEFINER public map RPC.
  // Its public_stops CTE already retrieves eligible stops
  // independently of route associations.
  //
  // ----------------------------------------------------------

  if (!(await hasMapAuthSession(currentUserId))) {
    return (await getPublicMapData()).stops;
  }

  // ----------------------------------------------------------
  // AUTHENTICATED USERS: VALID CACHE
  // ----------------------------------------------------------

  if (
    cachedStops &&
    cachedStops.expiresAt > Date.now()
  ) {
    return cachedStops.value;
  }

  // ----------------------------------------------------------
  // AUTHENTICATED USERS: SHARE IN-FLIGHT REQUEST
  // ----------------------------------------------------------

  if (!stopsRequest) {
    stopsRequest = fetchAuthenticatedStops().then(
      (stops) => {
        cachedStops = {
          value: stops,
          expiresAt: Date.now() + stopMapCacheLifetime,
        };

        return stops;
      },
    );
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
