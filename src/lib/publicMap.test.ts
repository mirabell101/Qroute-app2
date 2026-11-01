import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, getSession, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession },
    from,
    rpc,
  },
}));

import { getRouteDetails, getRouteMapIndex } from "./routes.ts";
import { getTerminals } from "./terminals.ts";
import { getRailFare, getTransportFareOptions } from "./fares.ts";

const publicMapData = {
  terminals: [
    { id: 1, name: "North Terminal", latitude: 14.7, longitude: 121.0, is_active: true },
  ],
  stops: [
    { id: 10, name: "Central Station", description: null, stop_type: "train_station", latitude: 14.71, longitude: 121.01, is_active: true },
    { id: 11, name: "South Station", description: null, stop_type: "train_station", latitude: 14.72, longitude: 121.02, is_active: true },
  ],
  routes: [
    {
      id: 20,
      name: "Blue Line",
      transport_type_id: 3,
      fare_area_id: 2,
      transport_types: { name: "Rail", color: "#123456" },
      transport_variants: { id: 30, code: "BL", name: "Blue Line train", fare_model: "matrix" },
      route_stops: [
        { route_id: 20, stop_order: 1, terminals: null, stops: { ...{ id: 10, name: "Central Station", latitude: 14.71, longitude: 121.01, stop_type: "train_station", description: null } } },
        { route_id: 20, stop_order: 2, terminals: null, stops: { ...{ id: 11, name: "South Station", latitude: 14.72, longitude: 121.02, stop_type: "train_station", description: null } } },
      ],
    },
  ],
  transportTypes: [{ id: 3, name: "Rail", color: "#123456" }],
  transportVariants: [{ id: 30, transport_type_id: 3, code: "BL", name: "Blue Line train", fare_model: "matrix" }],
  fareRules: [],
  fareRuleDistanceBands: [],
  fareDiscountRules: [],
  railFares: [
    { id: 40, route_id: 20, from_stop_id: 10, to_stop_id: 11, stored_value_fare: 25, single_journey_fare: 30, effective_from: "2026-01-01", effective_to: null },
  ],
};

describe("anonymous public map access", () => {
  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
    getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    rpc.mockResolvedValue({ data: publicMapData, error: null });
  });

  it("loads map, route, and fare data through the read-only public RPC", async () => {
    const terminals = await getTerminals();
    const index = await getRouteMapIndex();
    const route = await getRouteDetails(20);
    const fareOptions = await getTransportFareOptions(3, 2, "2026-11-01");
    const railFare = await getRailFare(20, 10, 11);

    expect(terminals).toEqual(publicMapData.terminals);
    expect(index.routes).toEqual([
      { id: 20, name: "Blue Line", transport_type_id: 3, transport_types: { name: "Rail", color: "#123456" } },
    ]);
    expect(index.points).toHaveLength(2);
    expect(route.created_by).toBeNull();
    expect(route.route_stops.map((stop) => stop.ref_id)).toEqual([10, 11]);
    expect(route.is_approved).toBe(true);
    expect(route.moderation_status).toBe("approved");
    expect(fareOptions.map((option) => option.variant.name)).toEqual(["Blue Line train"]);
    expect(railFare?.stored_value_fare).toBe(25);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_public_map_data");
    expect(from).not.toHaveBeenCalled();
  });
});
