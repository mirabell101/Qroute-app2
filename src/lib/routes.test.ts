import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = vi.hoisted(() => {
  const response: { data: unknown; error: { message: string } | null } = {
    data: [],
    error: null,
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    then: (
      resolve: (value: typeof response) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(response).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);

  return {
    query,
    response,
    from: vi.fn(() => query),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: mockSupabase,
}));

import { getRouteDetails } from "./routes";
import * as routeModule from "./routes";

describe("getRouteDetails", () => {
  beforeEach(() => {
    mockSupabase.query.select.mockClear();
    mockSupabase.query.eq.mockClear();
    mockSupabase.query.order.mockClear();
    mockSupabase.query.single.mockResolvedValue({
      data: {
        id: 8,
        name: "Sample route",
        transport_type_id: 3,
        fare_area_id: 5,
        created_by: null,
        is_approved: true,
        moderation_status: "approved",
        transport_types: { name: "Jeepney", color: "#123456" },
        transport_variants: {
          id: 2,
          code: "traditional",
          name: "Traditional jeepney",
          fare_model: "distance",
        },
        route_stops: [],
      },
      error: null,
    });
    mockSupabase.response.data = [];
    mockSupabase.response.error = null;
  });

  it("selects the transport type and fare area for fare comparisons", async () => {
    const route = await getRouteDetails(8);
    const selection = mockSupabase.query.select.mock.calls[0][0];

    expect(selection).toContain("transport_type_id");
    expect(selection).toContain("fare_area_id");
    expect(route.transport_type_id).toBe(3);
    expect(route.fare_area_id).toBe(5);
  });
});

describe("getRouteMapIndex", () => {
  beforeEach(() => {
    mockSupabase.query.select.mockClear();
    mockSupabase.query.eq.mockClear();
    mockSupabase.query.order.mockClear();
    mockSupabase.response.data = [];
    mockSupabase.response.error = null;
  });

  it("loads eligible routes and normalizes their nested points", async () => {
    mockSupabase.response.data = [
      {
        id: 8,
        name: "North Route",
        transport_type_id: 3,
        transport_types: { name: "Jeepney", color: "#123456" },
        route_stops: [
          {
            route_id: 8,
            stop_order: 1,
            terminals: {
              id: 4,
              name: "North Terminal",
              latitude: 14.6,
              longitude: 121.0,
              is_active: true,
            },
            stops: null,
          },
        ],
      },
    ];

    const getRouteMapIndex = Reflect.get(routeModule, "getRouteMapIndex");
    if (typeof getRouteMapIndex !== "function") {
      expect(getRouteMapIndex).toBeTypeOf("function");
      return;
    }

    const index = await getRouteMapIndex();

    expect(index.routes).toHaveLength(1);
    expect(index.points).toMatchObject([
      {
        kind: "terminal",
        ref_id: 4,
        routes: [{ route: { id: 8 }, stop_order: 1 }],
      },
    ]);
    expect(mockSupabase.query.select.mock.calls[0][0]).toContain("route_stops");
    expect(mockSupabase.query.eq.mock.calls).toEqual([
      ["is_active", true],
      ["is_deleted", false],
      ["is_banned", false],
    ]);
    expect(mockSupabase.query.order).toHaveBeenCalledWith("name", {
      ascending: true,
    });
  });

  it("rejects when the route-map query fails", async () => {
    mockSupabase.response.error = { message: "route-map query failed" };

    const getRouteMapIndex = Reflect.get(routeModule, "getRouteMapIndex");
    if (typeof getRouteMapIndex !== "function") {
      expect(getRouteMapIndex).toBeTypeOf("function");
      return;
    }

    await expect(getRouteMapIndex()).rejects.toThrow("route-map query failed");
  });
});
