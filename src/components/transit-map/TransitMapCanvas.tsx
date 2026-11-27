import { Fragment, useEffect, useMemo } from "react";

import { LocateFixed, MapPin } from "lucide-react";

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

import {
  findRouteStopIndex,
  getNextOverlappingRouteId,
  isEligibleMapPoint,
  isEligibleMapRoute,
} from "@/lib/routeMap";

import {
  getMapIcon,
  getMapVehicleType,
  getTerminalMapIcon,
  getVehicleMapIcon,
} from "@/lib/mapIcons";

import type { MapVehicleType } from "@/lib/mapIcons";

import { moveToCurrentLocation } from "./currentLocationViewport";
import { defaultPosition } from "./useTransitMap";

import type {
  Coordinates,
  TransitMapController,
} from "./useTransitMap";

// ============================================================
// LEAFLET DEFAULT MARKER CONFIGURATION
// ============================================================

delete (
  L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown }
)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ============================================================
// ROUTE LINE STYLE
// ============================================================

function getRouteDashArray(routeId: number, transportName: string): string {
  const normalizedName = transportName.toLowerCase();

  if (normalizedName.includes("bus")) return "3 7";
  if (normalizedName.includes("jeep")) return "12 7";
  return routeId % 2 === 0 ? "8 5" : "2 5";
}

// ============================================================
// CURRENT LOCATION MARKER
// ============================================================

function CurrentLocationMarker({
  position,
}: {
  position: Coordinates | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (position) moveToCurrentLocation(map, position);
  }, [map, position]);

  if (!position) return null;

  return (
    <Marker position={position} icon={getMapIcon("current_location")}>
      <Popup>Your current location</Popup>
    </Marker>
  );
}

// ============================================================
// ROUTE VIEWPORT
// ============================================================

function RouteViewport({
  positions,
}: {
  positions: Coordinates[];
}) {
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

// ============================================================
// PLACE VIEWPORT
// ============================================================

function PlaceViewport({
  position,
}: {
  position: Coordinates | null;
}) {
  const map = useMap();
  const latitude = position?.[0];
  const longitude = position?.[1];

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;

    map.flyTo([latitude, longitude], 16, { duration: 0.6 });
  }, [map, latitude, longitude]);

  return null;
}

// ============================================================
// PINNED COMMUNITY LOCATION
// ============================================================

function PinnedMapViewport({
  location,
}: {
  location: {
    coordinates: Coordinates;
    label: string;
  } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.flyTo(location.coordinates, 16, { duration: 0.6 });
    }
  }, [map, location]);

  if (!location) return null;

  return (
    <Marker position={location.coordinates} icon={getMapIcon("boarding")}>
      <Popup>{location.label}</Popup>
    </Marker>
  );
}

// ============================================================
// TRANSIT MAP CANVAS
// ============================================================

export function TransitMapCanvas({
  map,
}: {
  map: TransitMapController;
}) {
  const {
    // Location
    currentPosition,
    locationStatus,
    requestCurrentLocation,

    // Selected place
    selectedPlace,
    pinnedMapLocation,

    // Complete eligible map source and active selection scope
    mapPoints,
    displayedMapPoints,
    displayedAssociationRouteIds,
    activeTransportTypeId,

    // Route rendering
    displayedRouteLayers,
    coincidentRouteIdsByGeometry,
    selectedRouteId,
    selectedRoute,

    // Journey rendering
    journeyGeometry,
    isJourneyViewActive,

    // Stops and markers
    selectedRouteStops,
    stopMapPositions,
    boardingIndex,
    destinationIndex,
    routeColor,
    pointIcon,

    // Actions
    handlePlaceSelect,
    handleRouteLineSelect,
  } = map;

  // ----------------------------------------------------------
  // FINAL DEFENSIVE VISIBILITY CHECKS
  // ----------------------------------------------------------

  /**
   * The controller and data services already filter these records. The
   * canvas repeats the strict status check so a stale or unexpected object
   * cannot be drawn simply because it reached the rendering component.
   */
  const eligibleMapPoints = useMemo(
    () => mapPoints.filter(isEligibleMapPoint),
    [mapPoints],
  );

  const visibleMarkerPoints = useMemo(
    () => displayedMapPoints.filter(isEligibleMapPoint),
    [displayedMapPoints],
  );

  /**
   * A route line is drawable only when:
   * - the route itself is active and explicitly not deleted;
   * - every route stop resolves to an eligible point by exact kind + ID; and
   * - that point still carries the actual association to this route.
   *
   * This prevents a polyline from surviving after one of its locations has
   * become inactive/deleted, even if an old route geometry remains cached.
   */
  const eligibleRouteLayers = useMemo(
    () =>
      displayedRouteLayers.filter(({ routeId, route }) => {
        if (
          !isEligibleMapRoute(route) ||
          route.id !== routeId ||
          route.route_stops.length === 0
        ) {
          return false;
        }

        return route.route_stops.every((routeStop) => {
          const point = eligibleMapPoints.find(
            (candidate) =>
              candidate.kind === routeStop.kind &&
              candidate.ref_id === routeStop.ref_id,
          );

          return Boolean(
            point &&
            isEligibleMapPoint(point) &&
            point.routes.some(
              ({ route: associatedRoute }) =>
                associatedRoute.id === routeId &&
                isEligibleMapRoute(associatedRoute),
            ),
          );
        });
      }),
    [displayedRouteLayers, eligibleMapPoints],
  );

  // ----------------------------------------------------------
  // VIEWPORT POSITIONS
  // ----------------------------------------------------------

  /**
   * While a passenger journey is active, frame only its segment. During
   * saved-journey restoration, the segment may not be ready yet; in that
   * case do not briefly frame the full route.
   */
  const routeViewportPositions = isJourneyViewActive
    ? journeyGeometry?.positions ?? []
    : eligibleRouteLayers.flatMap(
        (layer) => layer.geometry?.positions ?? [],
      );

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
        {/* ==================================================
            BASE MAP
        ================================================== */}

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* ==================================================
            VIEWPORT AND LOCATION MARKERS
        ================================================== */}

        {/* GPS and community pins are independent overlays. They are not
            database transit locations and are never removed by the status
            filters below. */}
        <CurrentLocationMarker position={currentPosition} />

        <PlaceViewport
          position={
            selectedPlace && isEligibleMapPoint(selectedPlace)
              ? [selectedPlace.latitude, selectedPlace.longitude]
              : null
          }
        />

        <PinnedMapViewport location={pinnedMapLocation} />

        {/* ==================================================
            COMPLETE ROUTE LAYERS
        ==================================================

            Complete routes are hidden while a passenger journey is active.
            Only controller-approved route layers that still resolve every
            associated point are rendered.
        ================================================== */}

        {!isJourneyViewActive &&
          eligibleRouteLayers.map(({ routeId, route, geometry }) => {
            const isActive = routeId === Number(selectedRouteId);
            const dashArray = getRouteDashArray(
              routeId,
              route.transport_types.name,
            );
            const geometryKey = getRouteGeometryKey(geometry.positions);

            if (geometry.positions.length < 2) return null;

            return (
              <Fragment key={routeId}>
                {/* White route outline */}
                <Polyline
                  positions={geometry.positions}
                  pathOptions={{
                    color: "#ffffff",
                    weight: isActive ? 11 : 8,
                    opacity: isActive ? 0.9 : 0.55,
                  }}
                />

                {/* Actual transport route */}
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
                          coincidentRouteIdsByGeometry.get(geometryKey) ?? [routeId],
                          selectedRouteId ? Number(selectedRouteId) : null,
                          routeId,
                        ),
                      ),
                  }}
                />
              </Fragment>
            );
          })}

        {/* ==================================================
            PASSENGER JOURNEY SEGMENT
        ==================================================

            The journey line is extracted from the already-validated selected
            route geometry. It does not request a second OSRM route.
        ================================================== */}

        {isJourneyViewActive &&
          journeyGeometry &&
          selectedRoute &&
          isEligibleMapRoute(selectedRoute) &&
          journeyGeometry.positions.length >= 2 && (
            <Fragment key={`journey-${selectedRoute.id}`}>
              <Polyline
                positions={journeyGeometry.positions}
                pathOptions={{
                  color: "#ffffff",
                  weight: 13,
                  opacity: 0.95,
                }}
              />

              <Polyline
                positions={journeyGeometry.positions}
                pathOptions={{
                  color: selectedRoute.transport_types.color,
                  weight: 8,
                  opacity: 1,
                }}
              />
            </Fragment>
          )}

        {/* ==================================================
            ROUTE / JOURNEY VIEWPORT
        ================================================== */}

        {routeViewportPositions.length > 0 && (
          <RouteViewport positions={routeViewportPositions} />
        )}

        {/* ==================================================
            MAP POINT MARKERS
        ==================================================

            The controller supplies only points in the active selection scope:
            - full eligible points when nothing is selected;
            - route-associated points for a route selection;
            - the selected point plus the union of its serving routes for a
              stop/terminal selection; or
            - the selected journey route while a passenger journey is active.

            The canvas repeats point status checks and filters the route-mode
            glyphs to the same association scope.
        ================================================== */}

        {visibleMarkerPoints.flatMap((point) => {
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

          // ----------------------------------------------------
          // TRANSPORT MODES WITHIN THE ACTIVE ASSOCIATION SCOPE
          // ----------------------------------------------------

          const routeModes = new Map<
            number,
            {
              vehicleType: MapVehicleType;
              color: string;
            }
          >();

          const eligibleAssociations = point.routes.filter(
            ({ route }) =>
              isEligibleMapRoute(route) &&
              (
                activeTransportTypeId === null ||
                route.transport_type_id === activeTransportTypeId
              ),
          );

          const activeAssociationIds =
            displayedAssociationRouteIds === null
              ? null
              : new Set(displayedAssociationRouteIds);

          const markerRouteAssociations =
            activeAssociationIds === null
              ? eligibleAssociations
              : eligibleAssociations.filter(({ route }) =>
                  activeAssociationIds.has(route.id),
                );

          markerRouteAssociations.forEach(({ route }) => {
            routeModes.set(route.transport_type_id, {
              vehicleType: getMapVehicleType(route.transport_types.name),
              color: route.transport_types.color,
            });
          });

          const modes = [...routeModes.values()];

          // Independent stops remain visible when not route-associated.
          if (modes.length === 0 && point.kind === "stop") {
            modes.push({
              vehicleType:
                point.stop_type === "train_station" ? "train" : "other",
              color: "#2563eb",
            });
          }

          // Independent terminals use a neutral terminal glyph.
          if (modes.length === 0 && point.kind === "terminal") {
            modes.push({
              vehicleType: "other",
              color: "#0f2a47",
            });
          }

          // ----------------------------------------------------
          // PLACE SELECTION
          // ----------------------------------------------------

          const isSelectedPlace =
            selectedPlace?.kind === point.kind &&
            selectedPlace.ref_id === point.ref_id &&
            isEligibleMapPoint(selectedPlace);

          // ----------------------------------------------------
          // BOARDING / DESTINATION MARKERS
          // ----------------------------------------------------

          const isBoardingMarker =
            routeStopIndex !== null && routeStopIndex === boardingIndex;
          const isDestinationMarker =
            routeStopIndex !== null && routeStopIndex === destinationIndex;

          const terminalMode = modes[0] ?? {
            vehicleType: "other" as const,
            color: "#0f2a47",
          };

          const markerModes =
            isBoardingMarker || isDestinationMarker
              ? [
                  {
                    kind: isBoardingMarker
                      ? ("boarding" as const)
                      : ("destination" as const),
                    color: routeColor,
                    vehicleType: getMapVehicleType(
                      selectedRoute?.transport_types.name ?? "",
                    ),
                  },
                ]
              : point.kind === "terminal"
                ? isSelectedPlace
                  ? [
                      {
                        kind: "terminal" as const,
                        color: terminalMode.color,
                        vehicleType: terminalMode.vehicleType,
                      },
                    ]
                  : modes.map((mode) => ({
                      ...mode,
                      kind: "terminal" as const,
                    }))
                : modes.map((mode) => ({
                    ...mode,
                    kind: "vehicle" as const,
                  }));

          const offsetStart = -((markerModes.length - 1) * 9) / 2;

          // ----------------------------------------------------
          // RENDER MARKERS
          // ----------------------------------------------------

          return markerModes.map((mode, modeIndex) => {
            const displayOffsetX = offsetStart + modeIndex * 9;

            const icon =
              mode.kind !== "vehicle" &&
              mode.kind !== "terminal" &&
              routeStopIndex !== null &&
              routeStop
                ? pointIcon(routeStopIndex, routeStop)
                : mode.kind === "terminal"
                  ? getTerminalMapIcon(
                      isSelectedPlace,
                      mode.vehicleType,
                      mode.color,
                      displayOffsetX,
                    )
                  : getVehicleMapIcon(
                      mode.vehicleType,
                      mode.color,
                      displayOffsetX,
                    );

            return (
              <Marker
                key={`${point.kind}-${point.ref_id}-${mode.kind}-${mode.vehicleType}-${modeIndex}`}
                position={position}
                icon={icon}
                alt={`${point.name} ${
                  mode.kind === "vehicle" ? mode.vehicleType : mode.kind
                }`}
                title={`${point.name} — ${
                  mode.kind === "vehicle" ? mode.vehicleType : mode.kind
                }`}
                zIndexOffset={isOnSelectedRoute ? 1000 : 500}
                eventHandlers={{
                  click: () => handlePlaceSelect(point),
                }}
              />
            );
          });
        })}
      </MapContainer>

      {/* ======================================================
          CURRENT LOCATION CONTROL
      ====================================================== */}

      <button
        type="button"
        aria-label="Show my location"
        title="Show my location"
        disabled={locationStatus === "loading"}
        onClick={() => void requestCurrentLocation()}
        className="absolute right-4 top-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LocateFixed size={20} aria-hidden="true" />
      </button>
    </section>
  );
}

// ============================================================
// MAP STATUS
// ============================================================

export function TransitMapStatus({
  map,
  terminalStatusClassName =
    "absolute bottom-5 left-5 z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg",
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
