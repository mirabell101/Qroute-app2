import { Fragment, useEffect } from "react";

import { MapPin } from "lucide-react";

import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { getRouteGeometryKey } from "@/lib/routeGeometry";
import { findRouteStopIndex, getNextOverlappingRouteId } from "@/lib/routeMap";
import { getMapIcon, getMapVehicleType, getVehicleMapIcon } from "@/lib/mapIcons";
import type { MapVehicleType } from "@/lib/mapIcons";

import { defaultPosition } from "./useTransitMap";
import type { Coordinates, TransitMapController } from "./useTransitMap";

// Leaflet's default marker config (fallback for any marker without a custom icon).
delete (
  L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown }
)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Move the map to the user's current location.
function CurrentLocationMarker({ position }: { position: Coordinates | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, 16);
    }
  }, [map, position]);

  if (!position) return null;

  return (
    <Marker position={position} icon={getMapIcon("current_location")}>
      <Popup>Your current location</Popup>
    </Marker>
  );
}

// Automatically frame the selected road route.
function RouteViewport({ positions }: { positions: Coordinates[] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;

    if (positions.length === 1) {
      map.flyTo(positions[0], 16);
      return;
    }

    const bounds = L.latLngBounds(positions);
    map.flyToBounds(bounds, {
      paddingTopLeft: [
        Math.min(700, Math.max(260, map.getSize().x * 0.5)),
        140,
      ],
      paddingBottomRight: [50, 80],
      maxZoom: 16,
      duration: 0.8,
    });
  }, [map, positions]);

  return null;
}

function PlaceViewport({ position }: { position: Coordinates | null }) {
  const map = useMap();
  const latitude = position?.[0];
  const longitude = position?.[1];

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;

    map.flyTo([latitude, longitude], 16, { duration: 0.6 });
  }, [map, latitude, longitude]);

  return null;
}

export function TransitMapCanvas({ map }: { map: TransitMapController }) {
  const {
    currentPosition,
    selectedPlace,
    displayedRouteLayers,
    displayedRoutePositions,
    coincidentRouteIdsByGeometry,
    selectedRouteId,
    selectedRoute,
    selectedRouteStops,
    stopMapPositions,
    boardingIndex,
    destinationIndex,
    routeColor,
    mapPoints,
    pointIcon,
    handlePlaceSelect,
    handleRouteLineSelect,
  } = map;

  return (
    <section className="absolute inset-0 z-0 h-full w-full">
      <MapContainer
        center={defaultPosition}
        zoom={14}
        scrollWheelZoom
        zoomControl={false}
        dragging
        touchZoom
        doubleClickZoom
        boxZoom
        keyboard
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CurrentLocationMarker position={currentPosition} />
        <PlaceViewport
          position={
            selectedPlace
              ? [selectedPlace.latitude, selectedPlace.longitude]
              : null
          }
        />

        {displayedRouteLayers.map(({ routeId, route, geometry }) => {
          const isActive = routeId === Number(selectedRouteId);
          const transportName = route.transport_types.name.toLowerCase();
          const dashArray = transportName.includes("bus")
            ? "3 7"
            : transportName.includes("jeep")
              ? "12 7"
              : routeId % 2 === 0
                ? "8 5"
                : "2 5";
          const geometryKey = getRouteGeometryKey(geometry.positions);

          return geometry.positions.length >= 2 ? (
            <Fragment key={routeId}>
              <Polyline
                positions={geometry.positions}
                pathOptions={{
                  color: "#ffffff",
                  weight: isActive ? 11 : 8,
                  opacity: isActive ? 0.9 : 0.55,
                }}
              />
              <Polyline
                positions={geometry.positions}
                pathOptions={{
                  color: route.transport_types.color,
                  weight: isActive ? 7 : 4,
                  opacity: isActive ? 1 : 0.7,
                  dashArray,
                }}
                eventHandlers={{
                  click: () =>
                    handleRouteLineSelect(
                      getNextOverlappingRouteId(
                        coincidentRouteIdsByGeometry.get(geometryKey) ?? [
                          routeId,
                        ],
                        selectedRouteId ? Number(selectedRouteId) : null,
                        routeId
                      )
                    ),
                }}
              />
            </Fragment>
          ) : null;
        })}
        {displayedRoutePositions.length > 0 && (
          <RouteViewport positions={displayedRoutePositions} />
        )}

        {mapPoints.flatMap((point) => {
          const routeStopIndex = selectedRoute
            ? findRouteStopIndex(selectedRouteStops, point)
            : null;
          const routeStop =
            routeStopIndex === null
              ? null
              : selectedRouteStops[routeStopIndex] ?? null;
          const isOnSelectedRoute =
            routeStopIndex !== null && routeStop !== null;
          const position: Coordinates =
            routeStopIndex !== null && routeStop
              ? stopMapPositions[routeStopIndex] ?? [
                  point.latitude,
                  point.longitude,
                ]
              : [point.latitude, point.longitude];

          // One marker per transport type serving this point, each in its
          // configured transport_types.color.
          const routeModes = new Map<
            number,
            { vehicleType: MapVehicleType; color: string }
          >();
          point.routes.forEach(({ route }) => {
            routeModes.set(route.transport_type_id, {
              vehicleType: getMapVehicleType(route.transport_types.name),
              color: route.transport_types.color,
            });
          });
          const modes = [...routeModes.values()];
          if (modes.length === 0 && point.kind === "stop") {
            modes.push({
              vehicleType:
                point.stop_type === "train_station" ? "train" : "other",
              color: "#2563eb",
            });
          }

          const isBoardingMarker = routeStopIndex === boardingIndex;
          const isDestinationMarker = routeStopIndex === destinationIndex;
          const markerModes =
            isBoardingMarker || isDestinationMarker
              ? [
                  {
                    kind: isBoardingMarker
                      ? ("boarding" as const)
                      : ("destination" as const),
                    color: routeColor,
                    vehicleType: getMapVehicleType(
                      selectedRoute?.transport_types.name ?? ""
                    ),
                  },
                ]
              : point.kind === "terminal"
                ? [
                    {
                      kind: "terminal" as const,
                      color: "#0f2a47",
                      vehicleType: "other" as const,
                    },
                  ]
                : modes.map((mode) => ({ ...mode, kind: "vehicle" as const }));
          const offsetStart = -((markerModes.length - 1) * 9) / 2;

          return markerModes.map((mode, modeIndex) => {
            const icon =
              mode.kind !== "vehicle" &&
              mode.kind !== "terminal" &&
              routeStopIndex !== null &&
              routeStop
                ? pointIcon(routeStopIndex, routeStop)
                : mode.kind === "terminal"
                  ? getMapIcon("terminal")
                  : getVehicleMapIcon(
                      mode.vehicleType,
                      mode.color,
                      offsetStart + modeIndex * 9
                    );

            return (
              <Marker
                key={`${point.kind}-${point.ref_id}-${mode.kind}-${mode.vehicleType}-${modeIndex}`}
                position={position}
                icon={icon}
                alt={`${point.name} ${mode.kind === "vehicle" ? mode.vehicleType : mode.kind}`}
                title={`${point.name} — ${mode.kind === "vehicle" ? mode.vehicleType : mode.kind}`}
                zIndexOffset={isOnSelectedRoute ? 1000 : 500}
                eventHandlers={{
                  click: () => handlePlaceSelect(point),
                }}
              />
            );
          });
        })}
      </MapContainer>
    </section>
  );
}

export function TransitMapStatus({
  map,
  terminalStatusClassName = "absolute bottom-5 left-5 z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg",
}: {
  map: TransitMapController;
  terminalStatusClassName?: string;
}) {
  const {
    showLocationPopup,
    locationStatus,
    locationError,
    terminalsLoading,
    terminalError,
  } = map;

  return (
    <>
      {/* LOCATION STATUS */}
      {showLocationPopup && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-5 right-5 z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg"
        >
          {locationStatus === "loading" && (
            <p className="text-gray-700">Getting your location...</p>
          )}

          {locationStatus === "success" && (
            <p className="text-green-700">
              <MapPin size={16} className="mr-1 inline" />
              Your location has been detected.
            </p>
          )}

          {locationStatus === "error" && (
            <p className="text-red-700">{locationError}</p>
          )}
        </div>
      )}

      {/* TERMINAL STATUS */}
      {(terminalsLoading || terminalError) && (
        <div
          role={terminalError ? "alert" : "status"}
          className={terminalStatusClassName}
        >
          {terminalsLoading && (
            <p className="text-gray-700">Loading saved terminals...</p>
          )}

          {terminalError && (
            <p className="text-red-700">
              Failed to load terminals: {terminalError}
            </p>
          )}
        </div>
      )}
    </>
  );
}