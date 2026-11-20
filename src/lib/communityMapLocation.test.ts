import { describe, expect, it } from "vitest";

import { parseCommunityMapLocation } from "./communityMapLocation";

describe("parseCommunityMapLocation", () => {
  it("returns a validated pinned Community location", () => {
    expect(parseCommunityMapLocation({
      mapLocation: {
        latitude: 14.735,
        longitude: 121.055,
        label: "QRoute Community start",
      },
    })).toEqual({
      latitude: 14.735,
      longitude: 121.055,
      label: "QRoute Community start",
    });
  });

  it("rejects malformed, out-of-range, and missing locations", () => {
    expect(parseCommunityMapLocation(null)).toBeNull();
    expect(parseCommunityMapLocation({ mapLocation: "bad" })).toBeNull();
    expect(parseCommunityMapLocation({
      mapLocation: { latitude: 100, longitude: 121, label: "Invalid" },
    })).toBeNull();
    expect(parseCommunityMapLocation({
      mapLocation: { latitude: 14, longitude: 121 },
    })).toBeNull();
  });
});
