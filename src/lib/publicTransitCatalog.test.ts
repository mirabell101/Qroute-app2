import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import { getTransitCatalog, getTransportOptions } from "./contributions";

describe("public transit catalog", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  it("uses the public map RPC for a null verified user", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        terminals: [{ id: 1, name: "North", latitude: 14.7, longitude: 121.1, is_active: true }],
        stops: [{ id: 2, name: "South", description: null, stop_type: "road_stop", latitude: 14.6, longitude: 121.0, is_active: true }],
        routes: [{
          id: 3,
          name: "Route 3",
          transport_type_id: 1,
          fare_area_id: null,
          transport_types: { name: "Bus", color: "#2563eb" },
          transport_variants: { id: 4, code: "BUS", name: "Bus", fare_model: "distance" },
          route_stops: [
            { route_id: 3, stop_order: 1, terminals: { id: 1, name: "North", latitude: 14.7, longitude: 121.1, is_active: true }, stops: null },
            { route_id: 3, stop_order: 2, terminals: null, stops: { id: 2, name: "South", description: null, stop_type: "road_stop", latitude: 14.6, longitude: 121.0, is_active: true } },
          ],
        }],
        transportTypes: [{ id: 1, name: "Bus", color: "#2563eb" }],
        transportVariants: [{ id: 4, transport_type_id: 1, code: "BUS", name: "Bus", fare_model: "distance" }],
        fareRules: [],
        fareRuleDistanceBands: [],
        fareDiscountRules: [],
        railFares: [],
      },
      error: null,
    });

    await expect(getTransitCatalog(null)).resolves.toEqual(expect.objectContaining({
      points: expect.any(Array),
      routes: expect.any(Array),
    }));
    await expect(getTransportOptions(null)).resolves.toEqual({
      types: [{ id: 1, name: "Bus", color: "#2563eb" }],
      variants: [{ id: 4, transport_type_id: 1, code: "BUS", name: "Bus", fare_model: "distance" }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_map_data");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
