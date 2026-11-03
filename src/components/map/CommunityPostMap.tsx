import { useEffect, useMemo } from "react";
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

import type { CommunityPoint } from "@/lib/community";
import type { ExistingPoint } from "@/lib/contributions";
import { getEndpointMapIcon, getMapVehicleType } from "@/lib/mapIcons";

const defaultPosition: [number, number] = [14.7167, 121.05];

function MapClickHandler({ onPick }: { onPick: (point: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function FitPoints({ points }: { points: CommunityPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const locations = points.map(
      ({ latitude, longitude }) => [latitude, longitude] as [number, number],
    );
    if (locations.length === 1) {
      map.flyTo(locations[0], 15, { duration: 0.5 });
      return;
    }
    map.fitBounds(L.latLngBounds(locations), { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);

  return null;
}

export function CommunityPostMap({
  start,
  destination,
  activeTarget,
  existingPoints = [],
  onMapPick,
  onExistingPointPick,
  routeColor = "#2563eb",
  transportType = "",
  height = "h-[300px]",
}: {
  start: CommunityPoint | null;
  destination: CommunityPoint | null;
  activeTarget?: "start" | "destination" | null;
  existingPoints?: ExistingPoint[];
  onMapPick?: (point: [number, number]) => void;
  onExistingPointPick?: (point: ExistingPoint) => void;
  routeColor?: string;
  transportType?: string;
  height?: string;
}) {
  const selectedPoints = useMemo(
    () => [start, destination].filter(
      (point): point is CommunityPoint => point !== null,
    ),
    [start, destination],
  );
  const center = selectedPoints.length
    ? ([selectedPoints[0].latitude, selectedPoints[0].longitude] as [number, number])
    : defaultPosition;
  const normalizedTransport = transportType.toLowerCase();
  const dashArray = normalizedTransport.includes("bus")
    ? "3 7"
    : normalizedTransport.includes("jeep")
      ? "12 7"
      : normalizedTransport
        ? "2 5"
        : undefined;

  return (
    <div className={`${height} w-full overflow-hidden rounded-xl border border-gray-200`}>
      <MapContainer
        center={center}
        zoom={selectedPoints.length ? 14 : 12}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {onMapPick && activeTarget && <MapClickHandler onPick={onMapPick} />}
        <FitPoints points={selectedPoints} />

        {existingPoints.map((point) => (
          <CircleMarker
            key={`${point.kind}-${point.id}`}
            center={[point.latitude, point.longitude]}
            radius={6}
            bubblingMouseEvents={false}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#64748b", fillOpacity: 0.85 }}
            eventHandlers={{ click: () => onExistingPointPick?.(point) }}
          >
            <Tooltip>{point.name}</Tooltip>
          </CircleMarker>
        ))}

        {selectedPoints.length === 2 && (
          <>
            <Polyline
              positions={selectedPoints.map(
                ({ latitude, longitude }) => [latitude, longitude] as [number, number],
              )}
              pathOptions={{ color: "#ffffff", weight: 11, opacity: 0.9 }}
            />
            <Polyline
              positions={selectedPoints.map(
                ({ latitude, longitude }) => [latitude, longitude] as [number, number],
              )}
              pathOptions={{ color: routeColor, weight: 7, opacity: 1, dashArray }}
            />
          </>
        )}

        {start && (
          <Marker
            position={[start.latitude, start.longitude]}
            icon={getEndpointMapIcon("boarding", getMapVehicleType(transportType))}
            bubblingMouseEvents={false}
          >
            <Tooltip permanent direction="top">Start: {start.name}</Tooltip>
          </Marker>
        )}
        {destination && (
          <Marker
            position={[destination.latitude, destination.longitude]}
            icon={getEndpointMapIcon("destination", getMapVehicleType(transportType))}
            bubblingMouseEvents={false}
          >
            <Tooltip permanent direction="top">Destination: {destination.name}</Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
