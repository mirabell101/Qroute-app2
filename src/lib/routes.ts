
import { supabase } from "@/lib/supabase";

export interface RouteStop {
  route_id: number;
  stop_order: number;
  terminals: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
  };
}

export async function getRouteStops(
  routeId: number
): Promise<RouteStop[]> {
  const { data, error } = await supabase
    .from("route_stops")
    .select(`
      route_id,
      stop_order,
      terminals (
        id,
        name,
        latitude,
        longitude
      )
    `)
    .eq("route_id", routeId)
    .order("stop_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as RouteStop[];
}
