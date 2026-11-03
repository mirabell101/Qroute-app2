import { describe, expect, it } from "vitest";

import {
  parseSavedMapSelection,
  resolveSavedMapSelection,
} from "./routeMap";

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
    expect(
      resolveSavedMapSelection(
        { routes: [], points: [] },
        [],
        "terminal",
        9
      )
    ).toBeNull();
  });
});

describe("saved map selection router state", () => {
  it("parses valid kind and ID pairs", () => {
    expect(
      parseSavedMapSelection({
        savedSelection: { kind: "terminal", targetId: 9 },
      })
    ).toEqual({ kind: "terminal", targetId: 9 });
  });

  it("rejects missing, invalid, and unsafe selection state", () => {
    expect(parseSavedMapSelection(null)).toBeNull();
    expect(parseSavedMapSelection({})).toBeNull();
    expect(
      parseSavedMapSelection({
        savedSelection: { kind: "route", targetId: 1.5 },
      })
    ).toBeNull();
    expect(
      parseSavedMapSelection({
        savedSelection: { kind: "unknown", targetId: 1 },
      })
    ).toBeNull();
    expect(
      parseSavedMapSelection({
        savedSelection: { kind: "stop", targetId: Number.MAX_SAFE_INTEGER + 1 },
      })
    ).toBeNull();
  });
});
