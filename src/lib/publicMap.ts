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
}

export interface PublicMapRoute extends RouteMapRouteRecord {
  fare_area_id: number | null;
  transport_variants: TransportVariant;
}

export interface PublicMapData {
  terminals: Terminal[];
  stops: PublicMapStop[];
  routes: PublicMapRoute[];
  transportTypes: { id: number; name: string; color: string }[];
  transportVariants: (TransportVariant & { transport_type_id: number })[];
  fareRules: FareRule[];
  fareRuleDistanceBands: (FareDistanceBand & {
    id: number;
    fare_rule_id: number;
  })[];
  fareDiscountRules: FareDiscountRule[];
  railFares: RailFare[];
}

let publicMapDataRequest: Promise<PublicMapData> | null = null;

export async function hasMapAuthSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}

export function getPublicMapData(): Promise<PublicMapData> {
  if (publicMapDataRequest) return publicMapDataRequest;

  const request: Promise<PublicMapData> = Promise.resolve(
    supabase.rpc("get_public_map_data")
  )
    .then(({ data, error }) => {
      if (error || data === null || typeof data !== "object") {
        throw new Error("Unable to load public map information.");
      }

      return data as PublicMapData;
    })
    .catch((error: unknown) => {
      publicMapDataRequest = null;
      throw error instanceof Error
        ? error
        : new Error("Unable to load public map information.");
    });

  publicMapDataRequest = request;
  return request;
}
