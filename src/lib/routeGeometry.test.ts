import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteDetails, RouteStop } from "./routes";
import {
  getRouteGeometry,
  getRouteGeometryKey,
} from "./routeGeometry";

const routeStops: RouteStop[] = [
  {
    route_id: 17,
    stop_order: 1,
    kind: "stop",
    ref_id: 101,
    name: "First stop",
    latitude: 14.6,
    longitude: 121.0,
    stop_type: "road_stop",
    description: null,
  },
  {
    route_id: 17,
    stop_order: 2,
    kind: "stop",
    ref_id: 102,
    name: "Middle stop",
    latitude: 14.61,
    longitude: 121.01,
    stop_type: "road_stop",
    description: null,
  },
  {
    route_id: 17,
    stop_order: 3,
    kind: "terminal",
    ref_id: 10,
    name: "Last stop",
    latitude: 14.62,
    longitude: 121.02,
    stop_type: "terminal",
    description: null,
  },
];

function makeRoute(
  fareModel: RouteDetails["transport_variants"]["fare_model"] = "distance",
  stops = routeStops
): RouteDetails {
  return {
    id: 17,
    name: "North Loop",
    transport_type_id: 3,
    fare_area_id: 1,
    created_by: null,
    is_approved: true,
    moderation_status: "approved",
    transport_types: { name: "Jeepney", color: "#2563eb" },
    transport_variants: {
      id: 7,
      code: fareModel === "matrix" ? "RAIL" : "JEEP",
      name: "Regular",
      fare_model: fareModel,
    },
    route_stops: stops,
  };
}

function osrmResponse() {
  return {
    code: "Ok",
    routes: [
      {
        distance: 3000,
        duration: 600,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [121.0, 14.6],
            [121.01, 14.61],
            [121.02, 14.62],
          ] as [number, number][],
        },
        legs: [{ distance: 1200 }, { distance: 1800 }],
      },
    ],
    waypoints: [
      { location: [121.001, 14.601] as [number, number] },
      { location: [121.011, 14.611] as [number, number] },
      { location: [121.021, 14.621] as [number, number] },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getRouteGeometryKey", () => {
  it("treats reversed path positions as equivalent", () => {
    const positions: [number, number][] = [
      [14.6, 121],
      [14.61, 121.01],
      [14.62, 121.02],
    ];

    expect(getRouteGeometryKey(positions)).toBe(
      getRouteGeometryKey([...positions].reverse())
    );
    expect(
      getRouteGeometryKey([
        [14.6, 121],
        [14.61, 121.02],
        [14.62, 121.02],
      ])
    ).not.toBe(getRouteGeometryKey(positions));
  });
});

describe("getRouteGeometry", () => {
  it("requests only the route's ordered stops", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => osrmResponse(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const geometry = await getRouteGeometry(makeRoute());

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://router.project-osrm.org/route/v1/driving/121,14.6;121.01,14.61;121.02,14.62?overview=full&geometries=geojson&steps=false"
    );
    expect(geometry.positions).toEqual([
      [14.6, 121],
      [14.61, 121.01],
      [14.62, 121.02],
    ]);
    expect(geometry.stopDistances).toEqual([0, 1200, 3000]);
    expect(geometry.stopMapPositions).toEqual([
      [14.601, 121.001],
      [14.611, 121.011],
      [14.621, 121.021],
    ]);
    expect(geometry.totalDistanceMeters).toBe(3000);
    expect(geometry.durationSeconds).toBe(600);
  });

  it("builds rail station positions without OSRM", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const geometry = await getRouteGeometry(makeRoute("matrix"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(geometry.positions).toEqual([
      [14.6, 121],
      [14.61, 121.01],
      [14.62, 121.02],
    ]);
    expect(geometry.stopDistances[0]).toBe(0);
    expect(geometry.stopDistances[1]).toBeGreaterThan(0);
    expect(geometry.stopDistances[2]).toBeGreaterThan(
      geometry.stopDistances[1]
    );
    expect(geometry.stopMapPositions).toEqual(geometry.positions);
    expect(geometry.totalDistanceMeters).toBeGreaterThan(0);
    expect(geometry.durationSeconds).toBeNull();
  });

  it("rejects incomplete road distances as fare inputs", async () => {
    const response = osrmResponse();
    response.routes[0].legs = [{ distance: 1200 }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => response,
      })
    );

    const geometry = await getRouteGeometry(makeRoute());

    expect(geometry.positions).toHaveLength(3);
    expect(geometry.stopMapPositions).toHaveLength(3);
    expect(geometry.stopDistances).toEqual([]);
    expect(geometry.totalDistanceMeters).toBeNull();
  });

  it("rejects incomplete road waypoints as fare inputs", async () => {
    const response = osrmResponse();
    response.waypoints.pop();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => response,
      })
    );

    const geometry = await getRouteGeometry(makeRoute());

    expect(geometry.positions).toHaveLength(3);
    expect(geometry.stopMapPositions).toHaveLength(3);
    expect(geometry.stopMapPositions[2]).toBeNull();
    expect(geometry.stopDistances).toEqual([]);
    expect(geometry.totalDistanceMeters).toBeNull();
  });

  it("reports routing failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    );

    await expect(getRouteGeometry(makeRoute())).rejects.toThrow(
      "Routing service returned HTTP 503."
    );
  });

  it("returns no distance for a route with fewer than two stops", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const geometry = await getRouteGeometry(
      makeRoute("distance", routeStops.slice(0, 1))
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(geometry.positions).toEqual([]);
    expect(geometry.stopDistances).toEqual([]);
    expect(geometry.totalDistanceMeters).toBeNull();
  });
});
