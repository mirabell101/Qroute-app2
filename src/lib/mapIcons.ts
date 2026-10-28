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

export type MapVehicleType = "train" | "bus" | "jeepney" | "other";

type EndpointRole = "boarding" | "destination";

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
    fallbackLabel: "•",
  },

  // 6/6 — SELECTED DESTINATION POINT
  destination: {
    src: null, // ◄◄◄ INSERT DESTINATION POINT IMAGE PATH HERE (e.g. destinationImg)
    size: [38, 38],
    anchor: "bottom",
    fallbackColor: "#dc2626",
    fallbackLabel: "•",
  },
};

const cache = new Map<string, L.Icon | L.DivIcon>();
const endpointIconCache = new Map<string, L.DivIcon>();
const vehicleIconCache = new Map<string, L.DivIcon>();

const ENDPOINT_GLYPHS: Record<MapVehicleType, string> = {
  train: `
    <rect x="4" y="3" width="16" height="15" rx="3"/>
    <path d="M4 11h16M8 21l2-3m6 3-2-3M8 7h.01M16 7h.01"/>
  `,
  bus: `
    <path d="M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11"/>
    <path d="M5 11h14M5 16h14M8 21l2-4m6 4-2-4"/>
    <circle cx="8" cy="7.5" r=".75" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="7.5" r=".75" fill="currentColor" stroke="none"/>
  `,
  jeepney: `
    <path d="M3 16V9a2 2 0 0 1 2-2h10l4 4h2v5H3Z"/>
    <path d="M6 7V4h9v3M4 12h16"/>
    <circle cx="7" cy="17" r="2"/>
    <circle cx="17" cy="17" r="2"/>
    <path d="M8 21h8"/>
  `,
  other: `
    <path d="M5 15l1-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2l1 5"/>
    <path d="M4 15h16v4H4zM7 19v2m10-2v2"/>
    <circle cx="8" cy="12" r=".75" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="12" r=".75" fill="currentColor" stroke="none"/>
  `,
};

export function getMapVehicleType(transportTypeName: string): MapVehicleType {
  const normalizedName = transportTypeName.toLowerCase();
  if (normalizedName.includes("train")) return "train";
  if (normalizedName.includes("bus")) return "bus";
  if (normalizedName.includes("jeep")) return "jeepney";
  return "other";
}

export function getEndpointMapIcon(
  role: EndpointRole,
  vehicleType: MapVehicleType
): L.DivIcon {
  const key = `${role}:${vehicleType}`;
  const cached = endpointIconCache.get(key);
  if (cached) return cached;

  const color = role === "boarding" ? "#16a34a" : "#dc2626";
  const icon = L.divIcon({
    className: "",
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -38],
    html: `
      <div style="
        width:38px;height:38px;border-radius:9999px;
        background:${color};color:#fff;border:3px solid #fff;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 1px 5px rgba(0,0,0,0.45);
      ">
        <svg data-vehicle="${vehicleType}" viewBox="0 0 24 24" width="25" height="25"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${ENDPOINT_GLYPHS[vehicleType]}
        </svg>
      </div>
    `,
  });

  endpointIconCache.set(key, icon);
  return icon;
}

export function getVehicleMapIcon(
  vehicleType: MapVehicleType,
  color: string,
  displayOffsetX = 0
): L.DivIcon {
  const key = `${vehicleType}:${color}:${displayOffsetX}`;
  const cached = vehicleIconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17 - displayOffsetX, 17],
    popupAnchor: [0, -17],
    html: `
      <div style="
        width:34px;height:34px;border-radius:9999px;
        background:${color};color:#fff;border:2px solid #fff;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 1px 4px rgba(0,0,0,0.4);
      ">
        <svg data-vehicle="${vehicleType}" viewBox="0 0 24 24" width="23" height="23"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${ENDPOINT_GLYPHS[vehicleType]}
        </svg>
      </div>
    `,
  });

  vehicleIconCache.set(key, icon);
  return icon;
}

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