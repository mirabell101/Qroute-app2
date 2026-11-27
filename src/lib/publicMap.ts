import { supabase } from "@/lib/supabase";
import type { FareDistanceBand } from "./fareCalculations";
import type {
  FareDiscountRule,
  FareRule,
  RailFare,
  TransportVariant,
} from "./fares";
import type { RouteMapRouteRecord } from "./routeMap";
import type { Terminal } from "./terminals";

export interface PublicMapStop {
  id: number;
  name: string;
  description: string | null;
  stop_type: "road_stop" | "train_station";
  latitude: number;
  longitude: number;
  is_active: boolean;
  is_deleted: boolean;
  transport_type_id: number;
}

export interface PublicMapRoute extends RouteMapRouteRecord {
  transport_variants: TransportVariant;
}

export interface PublicMapData {
  terminals: Terminal[];
  stops: PublicMapStop[];
  routes: PublicMapRoute[];
  transportTypes: {
    id: number;
    name: string;
    color: string;
  }[];
  transportVariants: (TransportVariant & {
    transport_type_id: number;
  })[];
  fareRules: FareRule[];
  fareRuleDistanceBands: (FareDistanceBand & {
    id: number;
    fare_rule_id: number;
  })[];
  fareDiscountRules: FareDiscountRule[];
  railFares: RailFare[];
}

let publicMapDataRequest: Promise<PublicMapData> | null = null;

/** Invalidate the shared visitor-map RPC response before a live map refresh. */
export function invalidatePublicMapDataCache(): void {
  publicMapDataRequest = null;
}

export async function hasMapAuthSession(
  currentUserId: string | null | undefined = undefined,
): Promise<boolean> {
  if (currentUserId !== undefined) {
    return currentUserId !== null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}

export function getPublicMapData(): Promise<PublicMapData> {
  if (publicMapDataRequest) {
    return publicMapDataRequest;
  }

  let request!: Promise<PublicMapData>;
  request = Promise.resolve(supabase.rpc("get_public_map_data"))
    .then(({ data, error }) => {
      if (error || data === null || typeof data !== "object") {
        throw new Error("Unable to load public map information.");
      }

      return data as PublicMapData;
    })
    .catch((error: unknown) => {
      // A stale failed request must not clear a newer request created after
      // invalidatePublicMapDataCache() was called.
      if (publicMapDataRequest === request) {
        publicMapDataRequest = null;
      }
      throw error instanceof Error
        ? error
        : new Error("Unable to load public map information.");
    });

  publicMapDataRequest = request;
  return request;
}
