import { describe, expect, it } from "vitest";

import type { RouteStop } from "./routes";
import {
  buildRouteMapIndex,
  findRouteStopIndex,
  getNextOverlappingRouteId,
  getUniqueServingRoute,
  mergeMapTerminals,
  searchRouteMapItems,
  selectTripStop,
} from "./routeMap";
import type { RouteMapRouteRecord, TripSelection } from "./routeMap";

const routeRecord = (
  id: number,
  name: string,
  route_stops: RouteMapRouteRecord["route_stops"]
): RouteMapRouteRecord => ({
  id,
  name,
  transport_type_id: 4,
  transport_types: { name: "Jeepney", color: "#123456" },
  route_stops,
});

const northTerminal = {
  id: 1,
  name: "North Terminal",
  latitude: 14.6,
  longitude: 121.0,
};

const northStop = {
  id: 1,
  name: "North Stop",
  latitude: 14.61,
  longitude: 121.01,
  stop_type: "road_stop" as const,
  description: "Near the market",
};

describe("buildRouteMapIndex", () => {
  it("deduplicates shared places and retains all route associations", () => {
    const index = buildRouteMapIndex([
      routeRecord(10, "North Route", [
        {
          route_id: 10,
          stop_order: 1,
          terminals: northTerminal,
          stops: null,
        },
      ]),
      routeRecord(11, "Central Route", [
        {
          route_id: 11,
          stop_order: 4,
          terminals: northTerminal,
          stops: null,
        },
      ]),
    ]);

    expect(index.points).toHaveLength(1);
    expect(index.points[0]).toMatchObject({
      kind: "terminal",
      ref_id: 1,
      routes: [
        { route: { id: 10 }, stop_order: 1 },
        { route: { id: 11 }, stop_order: 4 },
      ],
    });
  });

  it("keeps a stop and terminal with the same numeric ID distinct", () => {
    const index = buildRouteMapIndex([
      routeRecord(10, "North Route", [
        {
          route_id: 10,
          stop_order: 1,
          terminals: northTerminal,
          stops: null,
        },
        {
          route_id: 10,
          stop_order: 2,
          terminals: null,
          stops: northStop,
        },
      ]),
    ]);

    expect(index.points).toHaveLength(2);
    expect(index.points.map((point) => point.kind).sort()).toEqual([
      "stop",
      "terminal",
    ]);
  });

  it("skips hidden nested points", () => {
    const index = buildRouteMapIndex([
      routeRecord(10, "Hidden Route", [
        {
          route_id: 10,
          stop_order: 1,
          terminals: null,
          stops: null,
        },
      ]),
    ]);

    expect(index.routes).toHaveLength(1);
    expect(index.points).toEqual([]);
  });
});

describe("mergeMapTerminals", () => {
  it("includes active terminals without route associations", () => {
    const points = mergeMapTerminals(
      { routes: [], points: [] },
      [
        {
          id: 8,
          name: "Unassigned Terminal",
          latitude: 14.7,
          longitude: 121.1,
          is_active: true,
        },
      ]
    );

    expect(points).toEqual([
      {
        kind: "terminal",
        ref_id: 8,
        name: "Unassigned Terminal",
        latitude: 14.7,
        longitude: 121.1,
        stop_type: "terminal",
        description: null,
        routes: [],
      },
    ]);
  });
});

describe("searchRouteMapItems", () => {
  it("matches route and place names case-insensitively after trimming", () => {
    const index = buildRouteMapIndex([
      routeRecord(10, "North Route", [
        {
          route_id: 10,
          stop_order: 1,
          terminals: northTerminal,
          stops: null,
        },
      ]),
    ]);

    const results = searchRouteMapItems(
      index.routes,
      index.points,
      "  NORTH  "
    );

    expect(results.map((result) => result.kind)).toEqual(["route", "point"]);
    expect(searchRouteMapItems(index.routes, index.points, "  ")).toEqual([]);
  });
});

describe("findRouteStopIndex", () => {
  it("matches both point kind and ID", () => {
    const stops: RouteStop[] = [
      {
        route_id: 10,
        stop_order: 1,
        kind: "terminal",
        ref_id: 1,
        name: "North Terminal",
        latitude: 14.6,
        longitude: 121,
        stop_type: "terminal",
        description: null,
      },
      {
        route_id: 10,
        stop_order: 2,
        kind: "stop",
        ref_id: 1,
        name: "North Stop",
        latitude: 14.61,
        longitude: 121.01,
        stop_type: "road_stop",
        description: null,
      },
    ];

    expect(
      findRouteStopIndex(stops, { kind: "stop", ref_id: 1 })
    ).toBe(1);
    expect(
      findRouteStopIndex(stops, { kind: "stop", ref_id: 9 })
    ).toBeNull();
    expect(
      findRouteStopIndex(stops, { kind: "stop", ref_id: 2 })
    ).toBeNull();
  });
});

describe("getUniqueServingRoute", () => {
  it("returns the sole serving route", () => {
    const index = buildRouteMapIndex([
      routeRecord(10, "North Route", [
        {
          route_id: 10,
          stop_order: 1,
          terminals: northTerminal,
          stops: null,
        },
      ]),
    ]);

    expect(getUniqueServingRoute(index.points[0])?.id).toBe(10);
  });

  it("returns null for shared or unserved points", () => {
    const sharedIndex = buildRouteMapIndex([
      routeRecord(10, "North Route", [
        {
          route_id: 10,
          stop_order: 1,
          terminals: northTerminal,
          stops: null,
        },
      ]),
      routeRecord(11, "Central Route", [
        {
          route_id: 11,
          stop_order: 2,
          terminals: northTerminal,
          stops: null,
        },
      ]),
    ]);
    const [unservedPoint] = mergeMapTerminals(
      { routes: [], points: [] },
      [{ ...northTerminal, is_active: true }]
    );

    expect(getUniqueServingRoute(sharedIndex.points[0])).toBeNull();
    expect(getUniqueServingRoute(unservedPoint)).toBeNull();
  });
});

describe("getNextOverlappingRouteId", () => {
  it("cycles through coincident route IDs on repeated line clicks", () => {
    expect(getNextOverlappingRouteId([10, 11, 12], null, 12)).toBe(12);
    expect(getNextOverlappingRouteId([10, 11, 12], 12, 12)).toBe(10);
    expect(getNextOverlappingRouteId([10, 11, 12], 10, 12)).toBe(11);
  });
});

describe("selectTripStop", () => {
  it("sets a boarding point, then only accepts a later destination", () => {
    const emptySelection: TripSelection = {
      boardingIndex: null,
      destinationIndex: null,
    };

    expect(selectTripStop(emptySelection, 2)).toEqual({
      boardingIndex: 2,
      destinationIndex: null,
    });
    expect(
      selectTripStop({ boardingIndex: 2, destinationIndex: null }, 4)
    ).toEqual({ boardingIndex: 2, destinationIndex: 4 });
    expect(
      selectTripStop({ boardingIndex: 2, destinationIndex: null }, 1)
    ).toEqual({ boardingIndex: 1, destinationIndex: null });
  });

  it("updates the destination when another later stop is clicked", () => {
    expect(
      selectTripStop({ boardingIndex: 2, destinationIndex: 4 }, 5)
    ).toEqual({ boardingIndex: 2, destinationIndex: 5 });
  });

  it("starts a new boarding selection when the clicked stop is not later", () => {
    expect(
      selectTripStop({ boardingIndex: 2, destinationIndex: 4 }, 1)
    ).toEqual({ boardingIndex: 1, destinationIndex: null });
    expect(
      selectTripStop({ boardingIndex: 2, destinationIndex: 4 }, 2)
    ).toEqual({ boardingIndex: 2, destinationIndex: null });
  });
});
