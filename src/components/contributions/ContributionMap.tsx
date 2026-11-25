
import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  getMapIcon,
  getMapVehicleType,
  getVehicleMapIcon,
} from "@/lib/mapIcons";

import {
  pointKey,
} from "@/lib/contributions";

import type {
  ExistingPoint,
  PointKind,
} from "@/lib/contributions";

// ==================================================
// TYPES
// ==================================================

export type ContributionMapMode =
  | "terminal"
  | "route"
  | "modify_route";

export type MapCoordinates = [number, number];

export interface ContributionMapLine {
  id: number;
  positions: MapCoordinates[];
  color: string;
}

export interface ContributionMapMarker {
  key: string;
  kind: PointKind;
  name: string;
  latitude: number;
  longitude: number;

  /** Null for terminals or points awaiting placement. */
  stopNumber: number | null;

  /** Draft routePoints index, or null for original route points. */
  draftIndex: number | null;

  /** Only newly placed draft points can be dragged. */
  draggable: boolean;
}

interface ContributionMapProps {
  mode: ContributionMapMode;

  currentPosition: MapCoordinates | null;
  focus: MapCoordinates | null;
  pin: MapCoordinates | null;

  routeMarkers: ContributionMapMarker[];
  candidatePoints: ExistingPoint[];

  routeColor: string;
  vehicleTypeName: string;

  linePositions: MapCoordinates[];
  previewLines: ContributionMapLine[];

  selectedPreviewRouteId: number | null;
  selectedPointKey: string | null;

  connectedKeys: Set<string>;

  onPick: (position: MapCoordinates) => void;
  onPickExisting: (point: ExistingPoint) => void;
  onSelectPoint: (key: string) => void;

  onMovePin: (position: MapCoordinates) => void;
  onMoveRoutePoint: (
    index: number,
    position: MapCoordinates
  ) => void;
}

// ==================================================
// CONSTANTS
// ==================================================

const DEFAULT_POSITION: MapCoordinates = [
  14.7167,
  121.05,
];

// ==================================================
// ICON HELPERS
// ==================================================

function numberedIcon(
  position: number,
  color: string
): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        background:${color};
        color:#fff;
        width:28px;
        height:28px;
        border-radius:9999px;
        border:2px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.45);
        display:flex;
        align-items:center;
        justify-content:center;
        font:600 12px sans-serif;
      ">
        ${position}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function existingLabel(point: ExistingPoint) {
  return point.kind === "stop" &&
    point.stopType === "train_station"
    ? `${point.name} (Station)`
    : point.name;
}

// ==================================================
// MAP EVENT HANDLERS
// ==================================================

function MapClickHandler({
  onPick,
}: {
  onPick: (position: MapCoordinates) => void;
}) {
  useMapEvents({
    click: (event) => {
      onPick([
        event.latlng.lat,
        event.latlng.lng,
      ]);
    },
  });

  return null;
}

function MapFocusHandler({
  position,
}: {
  position: MapCoordinates | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;

    map.flyTo(position, 17, {
      duration: 0.6,
    });
  }, [map, position?.[0], position?.[1]]);

  return null;
}

function MapSizeHandler() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

function MapFitHandler({
  linePositions,
  previewLines,
  selectedPreviewRouteId,
}: {
  linePositions: MapCoordinates[];
  previewLines: ContributionMapLine[];
  selectedPreviewRouteId: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    const selectedPreview =
      selectedPreviewRouteId !== null
        ? previewLines.filter(
            (line) =>
              line.id === selectedPreviewRouteId
          )
        : previewLines;

    const positions = [
      ...linePositions,
      ...selectedPreview.flatMap(
        (line) => line.positions
      ),
    ];

    if (positions.length < 2) return;

    const bounds = L.latLngBounds(positions);

    if (!bounds.isValid()) return;

    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 15,
      animate: true,
    });
  }, [
    map,
    linePositions,
    previewLines,
    selectedPreviewRouteId,
  ]);

  return null;
}

// ==================================================
// MAP COMPONENT
// ==================================================

export default function ContributionMap({
  mode,
  currentPosition,
  focus,
  pin,
  routeMarkers,
  candidatePoints,
  routeColor,
  vehicleTypeName,
  linePositions,
  previewLines,
  selectedPreviewRouteId,
  selectedPointKey,
  connectedKeys,
  onPick,
  onPickExisting,
  onSelectPoint,
  onMovePin,
  onMoveRoutePoint,
}: ContributionMapProps) {
  const vehicleType = getMapVehicleType(
    vehicleTypeName || "other"
  );

  const vehicleIcon = getVehicleMapIcon(
    vehicleType,
    routeColor
  );

  const stopIcon = getMapIcon(
    "stop",
    routeColor
  );

  return (
    <MapContainer
      center={currentPosition ?? DEFAULT_POSITION}
      zoom={currentPosition ? 17 : 14}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapSizeHandler />

      <MapFocusHandler
        position={focus ?? currentPosition}
      />

      <MapFitHandler
        linePositions={linePositions}
        previewLines={previewLines}
        selectedPreviewRouteId={
          selectedPreviewRouteId
        }
      />

      <MapClickHandler onPick={onPick} />

      {/* Current location */}

      {currentPosition && (
        <Marker
          position={currentPosition}
          icon={getMapIcon("current_location")}
          interactive={false}
        />
      )}

      {/* Route inspector preview lines */}

      {mode === "route" &&
        previewLines.map((line) => {
          const selected =
            line.id === selectedPreviewRouteId;

          return (
            <Polyline
              key={`preview-${line.id}`}
              positions={line.positions}
              interactive={false}
              pathOptions={{
                color: line.color,
                weight: selected ? 7 : 4,
                opacity: selected ? 0.9 : 0.55,
                dashArray: selected
                  ? undefined
                  : "8 6",
              }}
            />
          );
        })}

      {/* Main route being created or modified */}

      {linePositions.length >= 2 && (
        <Polyline
          positions={linePositions}
          interactive={false}
          pathOptions={{
            color: routeColor,
            weight: 6,
            opacity: 0.9,
          }}
        />
      )}

      {/* Standalone terminal pin */}

      {mode === "terminal" && pin && (
        <Marker
          position={pin}
          icon={vehicleIcon}
          draggable
          eventHandlers={{
            click: () => {
              onSelectPoint("terminal-pin");
            },

            dragend: (event) => {
              const { lat, lng } = (
                event.target as L.Marker
              ).getLatLng();

              onMovePin([lat, lng]);
            },
          }}
        >
          {selectedPointKey === "terminal-pin" && (
            <Tooltip permanent direction="top">
              T · Terminal location
            </Tooltip>
          )}
        </Marker>
      )}

      {/* Existing route points and draft points */}

      {routeMarkers.map((point) => {
        const selected =
          point.key === selectedPointKey;

        const icon =
          point.kind === "terminal"
            ? vehicleIcon
            : point.stopNumber !== null
              ? numberedIcon(
                  point.stopNumber,
                  routeColor
                )
              : stopIcon;

        return (
          <Marker
            key={point.key}
            position={[
              point.latitude,
              point.longitude,
            ]}
            icon={icon}
            draggable={
              point.draggable &&
              point.draftIndex !== null
            }
            eventHandlers={{
              click: (event) => {
                event.originalEvent?.stopPropagation();
                onSelectPoint(point.key);
              },

              dragend: (event) => {
                if (point.draftIndex === null) {
                  return;
                }

                const { lat, lng } = (
                  event.target as L.Marker
                ).getLatLng();

                onMoveRoutePoint(
                  point.draftIndex,
                  [lat, lng]
                );
              },
            }}
          >
            <Tooltip
              permanent={selected}
              direction="top"
              offset={[0, -12]}
            >
              {selected
                ? `T · ${point.name}`
                : point.stopNumber !== null
                  ? `#${point.stopNumber} · ${point.name}`
                  : point.name}
            </Tooltip>
          </Marker>
        );
      })}

      {/* Compatible candidate locations for new routes */}

      {mode === "route" &&
        candidatePoints.map((point) => {
          const key = pointKey(
            point.kind,
            point.id
          );

          const connected =
            connectedKeys.has(key);

          if (point.kind === "terminal") {
            return (
              <Marker
                key={key}
                position={[
                  point.latitude,
                  point.longitude,
                ]}
                icon={vehicleIcon}
                bubblingMouseEvents={false}
                eventHandlers={{
                  click: (event) => {
                    event.originalEvent?.stopPropagation();
                    onPickExisting(point);
                  },
                }}
              >
                <Tooltip>{point.name}</Tooltip>
              </Marker>
            );
          }

          return (
            <CircleMarker
              key={key}
              center={[
                point.latitude,
                point.longitude,
              ]}
              radius={connected ? 9 : 7}
              bubblingMouseEvents={false}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: connected
                  ? routeColor
                  : "#6b7280",
                fillOpacity: connected
                  ? 0.95
                  : 0.7,
              }}
              eventHandlers={{
                click: (event) => {
                  event.originalEvent?.stopPropagation();
                  onPickExisting(point);
                },
              }}
            >
              <Tooltip>
                {existingLabel(point)}
              </Tooltip>
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}
