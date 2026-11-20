import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
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

import { getMapIcon } from "@/lib/mapIcons";
import "leaflet/dist/leaflet.css";

type MapPosition = [number, number];

export interface RouteManagementMapPoint {
  key: string;
  name: string;
  kind: "stop" | "terminal";
  stopType?: "road_stop" | "train_station" | null;
  latitude: number;
  longitude: number;
}

function MapClickHandler({ onPick }: { onPick: (position: MapPosition) => void }) {
  useMapEvents({
    click(event) {
      onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function MapViewport({ positions }: { positions: MapPosition[] }) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 100);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (hasFitted.current || positions.length === 0) return;
    hasFitted.current = true;
    if (positions.length === 1) {
      map.setView(positions[0], 15);
      return;
    }

    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }, [map, positions]);

  return null;
}

function pointIcon(
  point: Pick<RouteManagementMapPoint, "kind" | "stopType">,
) {
  return getMapIcon(
    point.kind === "terminal"
      ? "terminal"
      : point.stopType === "train_station"
        ? "train_station"
        : "stop",
  );
}

export function RouteManagementMap({
  points,
  selectedPosition = null,
  editable = false,
  onPick,
  routeColor = "#2563eb",
  height = "h-[280px]",
}: {
  points: RouteManagementMapPoint[];
  selectedPosition?: MapPosition | null;
  editable?: boolean;
  onPick?: (position: MapPosition) => void;
  routeColor?: string;
  height?: string;
}) {
  const positions = useMemo(
    () => points.map(({ latitude, longitude }) => [latitude, longitude] as MapPosition),
    [points],
  );
  const center =
    selectedPosition ?? positions[0] ?? ([14.7167, 121.05] as MapPosition);
  const originalPosition = positions[0];
  const moved =
    editable &&
    selectedPosition !== null &&
    originalPosition !== undefined &&
    (selectedPosition[0] !== originalPosition[0] ||
      selectedPosition[1] !== originalPosition[1]);

  return (
    <div
      className={`${height} w-full overflow-hidden rounded-xl border border-slate-200`}
      data-route-management-map
    >
      <MapContainer
        center={center}
        zoom={positions.length ? 14 : 12}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport positions={positions} />
        {editable && onPick && <MapClickHandler onPick={onPick} />}

        {positions.length > 1 && (
          <Polyline positions={positions} pathOptions={{ color: routeColor, weight: 5 }} />
        )}

        {points.map((point, index) => {
          if (editable && index === 0) {
            return moved ? (
              <CircleMarker
                key={`${point.key}-original`}
                center={positions[index]}
                radius={5}
                pathOptions={{ color: "#fff", weight: 2, fillColor: "#64748b", fillOpacity: 0.8 }}
              >
                <Tooltip>Original location</Tooltip>
              </CircleMarker>
            ) : null;
          }

          return (
            <Marker key={point.key} position={positions[index]} icon={pointIcon(point)}>
              <Tooltip>{point.name}</Tooltip>
            </Marker>
          );
        })}

        {editable && selectedPosition && onPick && (
          <Marker
            position={selectedPosition}
            draggable
            icon={pointIcon(points[0] ?? { key: "selected", name: "", kind: "stop" })}
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = (event.target as L.Marker).getLatLng();
                onPick([lat, lng]);
              },
            }}
          >
            <Tooltip permanent direction="top">Selected location</Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
