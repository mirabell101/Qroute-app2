import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RouteMapSearchResult } from "./routeMap";
import {
  clearRecentSearches,
  getRecentSearchItem,
  getRecentSearches,
  recordRecentSearch,
  recordRecentSearchSelection,
  removeRecentSearch,
} from "./recentSearches";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const routeResult: RouteMapSearchResult = {
  kind: "route",
  route: {
    id: 21,
    name: "Blue Line",
    transport_type_id: 3,
    transport_types: { name: "Train", color: "#123456" },
  },
};

const stopResult: RouteMapSearchResult = {
  kind: "point",
  point: {
    kind: "stop",
    ref_id: 11,
    name: "Central Station",
    latitude: 14.71,
    longitude: 121.01,
    stop_type: "train_station",
    description: null,
    routes: [],
  },
};

const terminalResult: RouteMapSearchResult = {
  kind: "point",
  point: {
    kind: "terminal",
    ref_id: 11,
    name: "Central Terminal",
    latitude: 14.72,
    longitude: 121.02,
    stop_type: "terminal",
    description: null,
    routes: [],
  },
};

describe("recent search storage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T00:00:00.000Z"));
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps routes, stops, and terminals to stable recent search identities", () => {
    expect(getRecentSearchItem(routeResult)).toEqual({
      kind: "route",
      targetId: 21,
      name: "Blue Line",
    });
    expect(getRecentSearchItem(stopResult)).toEqual({
      kind: "stop",
      targetId: 11,
      name: "Central Station",
    });
    expect(getRecentSearchItem(terminalResult)).toEqual({
      kind: "terminal",
      targetId: 11,
      name: "Central Terminal",
    });
  });

  it("does not refresh recent history when restoring a map selection", () => {
    recordRecentSearchSelection(null, routeResult, "search");
    const historyAfterSearch = getRecentSearches(null);

    vi.setSystemTime(new Date("2026-11-02T00:01:00.000Z"));
    recordRecentSearchSelection(null, routeResult, "restore");

    expect(getRecentSearches(null)).toEqual(historyAfterSearch);
  });

  it("keeps anonymous and signed-in histories separate", () => {
    recordRecentSearch(null, getRecentSearchItem(routeResult));
    recordRecentSearch("user-1", getRecentSearchItem(stopResult));

    expect(getRecentSearches(null)).toEqual([
      {
        kind: "route",
        targetId: 21,
        name: "Blue Line",
        searchedAt: Date.parse("2026-11-02T00:00:00.000Z"),
      },
    ]);
    expect(getRecentSearches("user-1")).toHaveLength(1);
    expect(getRecentSearches("user-2")).toEqual([]);
  });

  it("moves a repeated item to the top with a new timestamp without merging kinds", () => {
    recordRecentSearch("user-1", {
      kind: "stop",
      targetId: 11,
      name: "Old stop name",
    });
    recordRecentSearch("user-1", getRecentSearchItem(terminalResult));
    vi.setSystemTime(new Date("2026-11-02T00:01:00.000Z"));
    recordRecentSearch("user-1", getRecentSearchItem(routeResult));
    recordRecentSearch("user-1", getRecentSearchItem(stopResult));

    expect(getRecentSearches("user-1")).toEqual([
      {
        kind: "stop",
        targetId: 11,
        name: "Central Station",
        searchedAt: Date.parse("2026-11-02T00:01:00.000Z"),
      },
      {
        kind: "route",
        targetId: 21,
        name: "Blue Line",
        searchedAt: Date.parse("2026-11-02T00:01:00.000Z"),
      },
      {
        kind: "terminal",
        targetId: 11,
        name: "Central Terminal",
        searchedAt: Date.parse("2026-11-02T00:00:00.000Z"),
      },
    ]);
  });

  it("removes entries older than 30 days when loaded or updated", () => {
    recordRecentSearch(null, getRecentSearchItem(routeResult));
    vi.setSystemTime(new Date("2026-12-03T00:00:00.000Z"));

    expect(getRecentSearches(null)).toEqual([]);

    vi.setSystemTime(new Date("2026-11-02T00:00:00.000Z"));
    recordRecentSearch(null, getRecentSearchItem(routeResult));
    vi.setSystemTime(new Date("2026-12-03T00:00:00.000Z"));
    recordRecentSearch(null, getRecentSearchItem(stopResult));

    expect(getRecentSearches(null).map(({ kind }) => kind)).toEqual(["stop"]);
  });

  it("retains entries exactly 30 days old", () => {
    recordRecentSearch(null, getRecentSearchItem(routeResult));
    vi.setSystemTime(new Date("2026-12-02T00:00:00.000Z"));

    expect(getRecentSearches(null)).toHaveLength(1);
  });

  it("caps history at 100 entries", () => {
    for (let targetId = 1; targetId <= 101; targetId += 1) {
      vi.setSystemTime(
        new Date(Date.parse("2026-11-02T00:00:00.000Z") + targetId)
      );
      recordRecentSearch("user-1", {
        kind: "route",
        targetId,
        name: `Route ${targetId}`,
      });
    }

    const history = getRecentSearches("user-1");
    expect(history).toHaveLength(100);
    expect(history[0]?.targetId).toBe(101);
    expect(history.some(({ targetId }) => targetId === 1)).toBe(false);
  });

  it("ignores malformed JSON and invalid stored entries without crashing", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordRecentSearch(null, getRecentSearchItem(routeResult));
    const key = localStorage.key(0);
    if (key === null) throw new Error("Recent history key was not created.");
    localStorage.setItem(key, "{not json");

    expect(getRecentSearches(null)).toEqual([]);

    recordRecentSearch(null, getRecentSearchItem(routeResult));
    const validKey = localStorage.key(0);
    if (validKey === null) throw new Error("Recent history key was not created.");
    localStorage.setItem(
      validKey,
      JSON.stringify([
        { kind: "route", targetId: 21, name: "Blue Line", searchedAt: Date.now() },
        { kind: "stop", targetId: -1, name: "", searchedAt: Date.now() },
      ])
    );

    expect(getRecentSearches(null)).toEqual([
      {
        kind: "route",
        targetId: 21,
        name: "Blue Line",
        searchedAt: Date.now(),
      },
    ]);
    expect(warning).toHaveBeenCalled();
  });

  it("does not record an empty item name", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordRecentSearch(null, getRecentSearchItem(routeResult));

    expect(
      recordRecentSearch(null, { kind: "route", targetId: 21, name: "  " })
    ).toHaveLength(1);
    expect(warning).toHaveBeenCalled();
  });

  it("removes one item or clears only the selected identity's history", () => {
    recordRecentSearch(null, getRecentSearchItem(routeResult));
    recordRecentSearch(null, getRecentSearchItem(stopResult));
    recordRecentSearch("user-1", getRecentSearchItem(terminalResult));

    expect(removeRecentSearch(null, "stop", 11)).toEqual([
      {
        kind: "route",
        targetId: 21,
        name: "Blue Line",
        searchedAt: Date.now(),
      },
    ]);

    clearRecentSearches(null);

    expect(getRecentSearches(null)).toEqual([]);
    expect(getRecentSearches("user-1")).toHaveLength(1);
  });
});
