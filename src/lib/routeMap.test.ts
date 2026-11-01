import { describe, expect, it } from "vitest";

import { resolveSavedMapSelection } from "./routeMap";

const route = {
  id: 20,
  name: "Blue Line",
  transport_type_id: 3,
  transport_types: { name: "Rail", color: "#123456" },
};

const point = {
  kind: "stop" as const,
  ref_id: 11,
  name: "Central Station",
  latitude: 14.71,
  longitude: 121.01,
  stop_type: "train_station" as const,
  description: null,
  routes: [{ route, stop_order: 1 }],
};

describe("saved map selection", () => {
  it("resolves visible routes and points to existing search results", () => {
    const index = { routes: [route], points: [point] };
    const mapPoints = [point, { ...point, kind: "terminal" as const, ref_id: 9 }];

    expect(resolveSavedMapSelection(index, mapPoints, "route", 20)).toEqual({
      kind: "route",
      route,
    });
    expect(resolveSavedMapSelection(index, mapPoints, "stop", 11)).toEqual({
      kind: "point",
      point,
    });
    expect(
      resolveSavedMapSelection(index, mapPoints, "terminal", 9)
    ).toEqual({
      kind: "point",
      point: mapPoints[1],
    });
  });

  it("does not resolve records absent from the visible map data", () => {
    expect(
      resolveSavedMapSelection(
        { routes: [], points: [] },
        [],
        "route",
        20
      )
    ).toBeNull();
    expect(
      resolveSavedMapSelection(
        { routes: [], points: [] },
        [],
        "stop",
        11
      )
    ).toBeNull();
  });
});
