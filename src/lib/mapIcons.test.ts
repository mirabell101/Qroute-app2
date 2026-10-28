import { describe, expect, it, vi } from "vitest";

import {
  getEndpointMapIcon,
  getMapIcon,
  getMapVehicleType,
  getVehicleMapIcon,
} from "./mapIcons";
import type { MapVehicleType } from "./mapIcons";

vi.mock("leaflet", () => ({
  default: {
    divIcon: <T extends object>(options: T) => ({ options }),
  },
}));

function getIconMarkup(icon: ReturnType<typeof getMapIcon>) {
  if (!("html" in icon.options)) {
    throw new Error("Expected a div icon");
  }
  return String(icon.options.html);
}

describe("getEndpointMapIcon", () => {
  it.each([
    ["train", "train"],
    ["bus", "bus"],
    ["jeepney", "jeepney"],
  ] as const)(
    "renders a %s glyph for both endpoint roles",
    (vehicleType: MapVehicleType, glyphName: string) => {
      const boardingIcon = getEndpointMapIcon("boarding", vehicleType);
      const destinationIcon = getEndpointMapIcon("destination", vehicleType);
      const boardingHtml = String(boardingIcon.options.html);
      const destinationHtml = String(destinationIcon.options.html);

      expect(boardingHtml).toContain(`data-vehicle="${glyphName}"`);
      expect(destinationHtml).toContain(`data-vehicle="${glyphName}"`);
      expect(boardingHtml).toContain("#16a34a");
      expect(destinationHtml).toContain("#dc2626");
      expect(boardingHtml).not.toContain(">A<");
      expect(destinationHtml).not.toContain(">B<");
    }
  );

  it("uses a distinct vector glyph for each transit vehicle", () => {
    const train = String(getEndpointMapIcon("boarding", "train").options.html);
    const bus = String(getEndpointMapIcon("boarding", "bus").options.html);
    const jeepney = String(
      getEndpointMapIcon("boarding", "jeepney").options.html
    );

    expect(train).toContain('<rect x="4" y="3" width="16" height="15"');
    expect(bus).toContain('<path d="M5 17V6a3 3 0 0 1 3-3h8');
    expect(jeepney).toContain('<path d="M3 16V9a2 2 0 0 1 2-2h10');
  });
});

describe("getVehicleMapIcon", () => {
  it.each(["train", "bus", "jeepney"] as const)(
    "renders a %s glyph for route markers",
    (vehicleType) => {
      const icon = String(
        getVehicleMapIcon(vehicleType, "#123456").options.html
      );

      expect(icon).toContain(`data-vehicle="${vehicleType}"`);
      expect(icon).toContain("background:#123456");
      expect(icon).not.toContain(">A<");
    }
  );
});

it("does not render legacy A/B labels for endpoint markers", () => {
  expect(getIconMarkup(getMapIcon("boarding"))).not.toContain(">A<");
  expect(getIconMarkup(getMapIcon("destination"))).not.toContain(">B<");
});

describe("getMapVehicleType", () => {
  it.each([
    ["Train", "train"],
    ["Bus", "bus"],
    ["Jeepney", "jeepney"],
    ["E-Jeepney", "jeepney"],
    ["Taxi", "other"],
  ] as const)(
    "maps transport type %s to the %s icon",
    (transportTypeName, expectedType) => {
      expect(getMapVehicleType(transportTypeName)).toBe(expectedType);
    }
  );
});
