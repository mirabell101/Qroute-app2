import { useEffect, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
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
import { pointKey } from "@/lib/contributions";
import type { ExistingPoint, PointKind } from "@/lib/contributions";

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
  stopNumber: number | null;
  draftIndex: number | null;
  draggable: boolean;
  /** True only for a newly created draft location, not a reused shared point. */
  isNewPoint: boolean;
}

interface ContributionMapProps {
  mode: ContributionMapMode;
  currentPosition: MapCoordinates | null;
  focus: MapCoordinates | null;
  pin: MapCoordinates | null;
  pinName: string;
  routeMarkers: ContributionMapMarker[];
  candidatePoints: ExistingPoint[];
  routeColor: string;
  vehicleTypeName: string;
  linePositions: MapCoordinates[];
  previewLines: ContributionMapLine[];
  selectedPreviewRouteId: number | null;
  selectedPointKey: string | null;
  connectedKeys: Set<string>;
  fitBoundsKey: string;
  onPick: (position: MapCoordinates) => void;
  onPickExisting: (point: ExistingPoint) => void;
  onSelectPoint: (key: string | null) => void;
  onMovePin: (position: MapCoordinates) => void;
  onMoveRoutePoint: (index: number, position: MapCoordinates) => void;
  onPinNameChange: (name: string) => void;
  onRoutePointNameChange: (key: string, name: string) => void;
}

const DEFAULT_POSITION: MapCoordinates = [14.7167, 121.05];

function numberedIcon(position: number, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:600 12px sans-serif">${position}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function existingLabel(point: ExistingPoint) {
  return point.kind === "stop" && point.stopType === "train_station"
    ? `${point.name} (Station)`
    : point.name;
}

function NamePopupContent({
  label,
  value,
  onChange,
  onDone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
}) {
  return (
    <div
      className="w-[210px] space-y-2"
      onClick={(event) => event.stopPropagation()}
    >
      <label className="block text-xs font-semibold text-gray-800">
        Name this {label.toLowerCase()}
      </label>
      <input
        autoFocus
        value={value}
        maxLength={120}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onDone();
          }
        }}
        placeholder={`Enter ${label.toLowerCase()} name`}
        className="h-9 w-full rounded-md border border-gray-300 px-2.5 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A]"
      />
      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-md bg-[#12395A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b4b6f]"
      >
        Done
      </button>
    </div>
  );
}

function MapClickHandler({
  onPick,
}: {
  onPick: (position: MapCoordinates) => void;
}) {
  useMapEvents({
    click: (event) => onPick([event.latlng.lat, event.latlng.lng]),
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
    map.flyTo(position, 17, { duration: 0.6 });
  }, [map, position?.[0], position?.[1]]);
  return null;
}

function MapSizeHandler() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

/**
 * Fit the map only when the selected route/inspected route changes.
 * Route geometry changes caused by pin placement must not change the zoom.
 */
function MapFitHandler({
  fitBoundsKey,
  mode,
  linePositions,
  previewLines,
  selectedPreviewRouteId,
}: {
  fitBoundsKey: string;
  mode: ContributionMapMode;
  linePositions: MapCoordinates[];
  previewLines: ContributionMapLine[];
  selectedPreviewRouteId: number | null;
}) {
  const map = useMap();
  const lastFitKey = useRef<string | null>(null);

  useEffect(() => {
    if (!fitBoundsKey) {
      lastFitKey.current = null;
      return;
    }
    if (lastFitKey.current === fitBoundsKey) return;

    const selectedPreview = selectedPreviewRouteId !== null
      ? previewLines.filter((line) => line.id === selectedPreviewRouteId)
      : previewLines;
    const positions = mode === "modify_route"
      ? linePositions
      : selectedPreview.flatMap((line) => line.positions);

    if (positions.length < 2) return;
    const bounds = L.latLngBounds(positions);
    if (!bounds.isValid()) return;

    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 15,
      animate: true,
    });
    lastFitKey.current = fitBoundsKey;
  }, [
    map,
    fitBoundsKey,
    mode,
    linePositions,
    previewLines,
    selectedPreviewRouteId,
  ]);

  return null;
}

function StandalonePinMarker({
  position,
  mode,
  icon,
  name,
  openPopup,
  onNameChange,
  onDone,
  onSelect,
  onMove,
}: {
  position: MapCoordinates;
  mode: "terminal";
  icon: L.Icon | L.DivIcon;
  name: string;
  openPopup: boolean;
  onNameChange: (name: string) => void;
  onDone: () => void;
  onSelect: () => void;
  onMove: (position: MapCoordinates) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (openPopup) markerRef.current?.openPopup();
    else markerRef.current?.closePopup();
  }, [openPopup, position[0], position[1]]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      draggable
      eventHandlers={{
        click: () => {
          onSelect();
          markerRef.current?.openPopup();
        },
        dragend: (event) => {
          const { lat, lng } = (event.target as L.Marker).getLatLng();
          onMove([lat, lng]);
        },
      }}
    >
      <Popup autoClose={false} closeOnClick={false} closeButton>
        <NamePopupContent
          label="Terminal"
          value={name}
          onChange={onNameChange}
          onDone={onDone}
        />
      </Popup>
      {openPopup && (
        <Tooltip permanent direction="top">
          T · {name || "Unnamed terminal"}
        </Tooltip>
      )}
    </Marker>
  );
}

function RoutePointMarker({
  point,
  icon,
  selected,
  showNamePopup,
  onSelect,
  onMove,
  onNameChange,
  onPopupDone,
}: {
  point: ContributionMapMarker;
  icon: L.Icon | L.DivIcon;
  selected: boolean;
  showNamePopup: boolean;
  onSelect: (key: string) => void;
  onMove: (index: number, position: MapCoordinates) => void;
  onNameChange: (key: string, name: string) => void;
  onPopupDone: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const popupOpen = selected && showNamePopup;

  // Wait until Leaflet has mounted the marker before opening the popup. This
  // also lets contributors click an existing approved route point in
  // modify-route mode and edit its proposed name without changing live data.
  useEffect(() => {
    if (!popupOpen) {
      markerRef.current?.closePopup();
      return;
    }

    const timer = window.setTimeout(() => {
      markerRef.current?.openPopup();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [popupOpen, point.key, point.latitude, point.longitude]);

  return (
    <Marker
      ref={markerRef}
      position={[point.latitude, point.longitude]}
      icon={icon}
      draggable={point.draggable && point.draftIndex !== null}
      eventHandlers={{
        click: (event) => {
          event.originalEvent?.stopPropagation();
          onSelect(point.key);
          // Also reopen on repeated clicks after a contributor manually closes
          // the popup with Leaflet's close button.
          if (showNamePopup) markerRef.current?.openPopup();
        },
        dragend: (event) => {
          if (point.draftIndex === null) return;
          const { lat, lng } = (event.target as L.Marker).getLatLng();
          onMove(point.draftIndex, [lat, lng]);
        },
      }}
    >
      {showNamePopup && (
        <Popup autoClose={false} closeOnClick={false} closeButton>
          <NamePopupContent
            label={point.kind === "terminal" ? "Terminal" : "Stop"}
            value={point.name}
            onChange={(value) => onNameChange(point.key, value)}
            onDone={onPopupDone}
          />
        </Popup>
      )}
      <Tooltip permanent={selected} direction="top" offset={[0, -12]}>
        {selected
          ? point.kind === "terminal"
            ? `T · ${point.name || "Unnamed terminal"}`
            : `#${point.stopNumber ?? "–"} · ${point.name || "Unnamed stop"}`
          : point.stopNumber !== null
            ? `#${point.stopNumber} · ${point.name}`
            : point.name}
      </Tooltip>
    </Marker>
  );
}

export default function ContributionMap({
  mode,
  currentPosition,
  focus,
  pin,
  pinName,
  routeMarkers,
  candidatePoints,
  routeColor,
  vehicleTypeName,
  linePositions,
  previewLines,
  selectedPreviewRouteId,
  selectedPointKey,
  connectedKeys,
  fitBoundsKey,
  onPick,
  onPickExisting,
  onSelectPoint,
  onMovePin,
  onMoveRoutePoint,
  onPinNameChange,
  onRoutePointNameChange,
}: ContributionMapProps) {
  const vehicleType = getMapVehicleType(vehicleTypeName || "other");
  const vehicleIcon = getVehicleMapIcon(vehicleType, routeColor);
  const stopIcon = getMapIcon("stop", routeColor);
  const pinKey = "terminal-pin";

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
      <MapFocusHandler position={focus ?? currentPosition} />
      <MapFitHandler
        fitBoundsKey={fitBoundsKey}
        mode={mode}
        linePositions={linePositions}
        previewLines={previewLines}
        selectedPreviewRouteId={selectedPreviewRouteId}
      />
      <MapClickHandler onPick={onPick} />

      {currentPosition && (
        <Marker
          position={currentPosition}
          icon={getMapIcon("current_location")}
          interactive={false}
        />
      )}

      {mode === "route" && previewLines.map((line) => {
        const selected = line.id === selectedPreviewRouteId;
        return (
          <Polyline
            key={`preview-${line.id}`}
            positions={line.positions}
            interactive={false}
            pathOptions={{
              color: line.color,
              weight: selected ? 7 : 4,
              opacity: selected ? 0.9 : 0.55,
              dashArray: selected ? undefined : "8 6",
            }}
          />
        );
      })}

      {linePositions.length >= 2 && (
        <Polyline
          positions={linePositions}
          interactive={false}
          pathOptions={{ color: routeColor, weight: 6, opacity: 0.9 }}
        />
      )}

      {mode === "terminal" && pin && (
        <StandalonePinMarker
          position={pin}
          mode="terminal"
          icon={vehicleIcon}
          name={pinName}
          openPopup={selectedPointKey === pinKey}
          onNameChange={onPinNameChange}
          onDone={() => onSelectPoint(null)}
          onSelect={() => onSelectPoint(pinKey)}
          onMove={onMovePin}
        />
      )}

      {routeMarkers.map((point) => {
        const selected = point.key === selectedPointKey;
        const icon = point.kind === "terminal"
          ? vehicleIcon
          : point.stopNumber !== null
            ? numberedIcon(point.stopNumber, routeColor)
            : stopIcon;

        return (
          <RoutePointMarker
            key={point.key}
            point={point}
            icon={icon}
            selected={selected}
            showNamePopup={point.isNewPoint || mode === "modify_route"}
            onSelect={onSelectPoint}
            onMove={onMoveRoutePoint}
            onNameChange={onRoutePointNameChange}
            onPopupDone={() => onSelectPoint(null)}
          />
        );
      })}

      {mode === "route" && candidatePoints.map((point) => {
        const key = pointKey(point.kind, point.id);
        const connected = connectedKeys.has(key);
        if (point.kind === "terminal") {
          return (
            <Marker
              key={key}
              position={[point.latitude, point.longitude]}
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
            center={[point.latitude, point.longitude]}
            radius={connected ? 9 : 7}
            bubblingMouseEvents={false}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor: connected ? routeColor : "#6b7280",
              fillOpacity: connected ? 0.95 : 0.7,
            }}
            eventHandlers={{
              click: (event) => {
                event.originalEvent?.stopPropagation();
                onPickExisting(point);
              },
            }}
          >
            <Tooltip>{existingLabel(point)}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
