import L from "leaflet";

export type MapIconKind =
  | "terminal"
  | "stop"
  | "bus_stop"
  | "jeepney_stop"
  | "train_station"
  | "current_location"
  | "boarding"
  | "destination";

interface IconSpec {
  src: string | null;
  size: [number, number];
  anchor: "center" | "bottom";
  fallbackColor: string;
  fallbackLabel: string;
}

// =====================================================================
// ICON IMAGE PLACEHOLDERS
//
// For each icon below, do ONE of these:
//   A) Put the image in /public/icons and set src: "/icons/your-file.png"
//   B) Import it from src/assets (add the import line here), then set
//      src: yourImportedVariable
//
// While src is null, a simple drawn fallback icon is used, so nothing breaks.
// Adjust `size` to match your artwork. Use anchor "bottom" for pin-shaped
// images (the tip sits on the location) or "center" for round badges.
// =====================================================================

// ▼▼▼ OPTIONAL IMPORTS (uncomment and fix the filenames) ▼▼▼
// import terminalImg from "@/assets/INSERT_TERMINAL_ICON_FILENAME.png";
// import stopImg from "@/assets/INSERT_BUS_STOP_ICON_FILENAME.png";
// import trainStationImg from "@/assets/INSERT_TRAIN_STATION_ICON_FILENAME.png";
// import currentLocationImg from "@/assets/INSERT_CURRENT_LOCATION_ICON_FILENAME.png";
// import boardingImg from "@/assets/INSERT_BOARDING_ICON_FILENAME.png";
// import destinationImg from "@/assets/INSERT_DESTINATION_ICON_FILENAME.png";

const ICONS: Record<MapIconKind, IconSpec> = {
  // 1/6 — TERMINAL (every terminal on the map)
  terminal: {
    src: null, // ◄◄◄ INSERT TERMINAL IMAGE PATH HERE (e.g. terminalImg)
    size: [40, 40],
    anchor: "bottom",
    fallbackColor: "#0f2a47",
    fallbackLabel: "T",
  },

  // 2/6 — BUS / JEEPNEY STOP (stops along the selected route)
  stop: {
    src: null, // ◄◄◄ INSERT BUS STOP IMAGE PATH HERE (e.g. stopImg)
    size: [30, 30],
    anchor: "center",
    fallbackColor: "#2563eb",
    fallbackLabel: "S",
  },

  bus_stop: {
    src: null,
    size: [32, 32],
    anchor: "center",
    fallbackColor: "#2563eb",
    fallbackLabel: "B",
  },

  jeepney_stop: {
    src: null,
    size: [32, 32],
    anchor: "center",
    fallbackColor: "#16a34a",
    fallbackLabel: "J",
  },

  // 3/6 — TRAIN STATION (LRT-1 / LRT-2 / MRT-3 stations)
  train_station: {
    src: null, // ◄◄◄ INSERT TRAIN STATION IMAGE PATH HERE (e.g. trainStationImg)
    size: [32, 32],
    anchor: "center",
    fallbackColor: "#e0a526",
    fallbackLabel: "R",
  },

  // 4/6 — CURRENT LOCATION (the user's position)
  current_location: {
    src: null, // ◄◄◄ INSERT CURRENT LOCATION IMAGE PATH HERE (e.g. currentLocationImg)
    size: [34, 34],
    anchor: "center",
    fallbackColor: "#16a34a",
    fallbackLabel: "•",
  },

  // 5/6 — SELECTED BOARDING POINT
  boarding: {
    src: null, // ◄◄◄ INSERT BOARDING POINT IMAGE PATH HERE (e.g. boardingImg)
    size: [38, 38],
    anchor: "bottom",
    fallbackColor: "#16a34a",
    fallbackLabel: "A",
  },

  // 6/6 — SELECTED DESTINATION POINT
  destination: {
    src: null, // ◄◄◄ INSERT DESTINATION POINT IMAGE PATH HERE (e.g. destinationImg)
    size: [38, 38],
    anchor: "bottom",
    fallbackColor: "#dc2626",
    fallbackLabel: "B",
  },
};

const cache = new Map<string, L.Icon | L.DivIcon>();

// `color` only tints the fallback icon (used for stops so they match the route).
export function getMapIcon(
  kind: MapIconKind,
  color?: string,
  displayOffsetX = 0
): L.Icon | L.DivIcon {
  const key = `${kind}:${color ?? ""}:${displayOffsetX}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const spec = ICONS[kind];
  const [width, height] = spec.size;

  const iconAnchor: [number, number] =
    spec.anchor === "bottom"
      ? [width / 2, height]
      : [width / 2 - displayOffsetX, height / 2];
  const popupAnchor: [number, number] =
    spec.anchor === "bottom" ? [0, -height] : [0, -height / 2];

  const icon = spec.src
    ? L.icon({
        iconUrl: spec.src,
        iconSize: spec.size,
        iconAnchor,
        popupAnchor,
      })
    : L.divIcon({
        className: "",
        iconSize: spec.size,
        iconAnchor,
        popupAnchor,
        html: `
          <div style="
            width:${width}px;height:${height}px;border-radius:9999px;
            background:${color ?? spec.fallbackColor};color:#fff;
            border:2px solid #fff;display:flex;align-items:center;
            justify-content:center;font-size:13px;font-weight:700;
            box-shadow:0 1px 4px rgba(0,0,0,0.4);
          ">${spec.fallbackLabel}</div>
        `,
      });

  cache.set(key, icon);
  return icon;
}