import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { getTerminals } from "@/lib/terminals";
import type { Terminal } from "@/lib/terminals";
import { getRouteDetails, getRouteMapIndex } from "@/lib/routes";
import type { RouteDetails, RouteStop } from "@/lib/routes";
import { getRouteGeometry, getRouteGeometryKey } from "@/lib/routeGeometry";
import type { RouteGeometry } from "@/lib/routeGeometry";
import {
  findRouteStopIndex,
  getDisplayedRouteIds,
  getTripDistanceMeters,
  getUniqueServingRoute,
  isRepeatedBoardingPoint,
  mergeMapTerminals,
  searchRouteMapItems,
  selectTripStop,
} from "@/lib/routeMap";
import type {
  RouteMapIndex,
  RouteMapPoint,
  RouteMapSearchResult,
} from "@/lib/routeMap";
import {
  buildFareCards,
  calculateFareOptionEstimates,
} from "@/lib/fareCalculations";
import { getRailFare, getTransportFareOptions } from "@/lib/fares";
import type { RailFare, TransportFareOption } from "@/lib/fares";
import {
  getEndpointMapIcon,
  getMapIcon,
  getMapVehicleType,
} from "@/lib/mapIcons";
import { getPointImages } from "@/lib/mapImages";
import type { PointImage } from "@/lib/mapImages";

export type LocationStatus = "loading" | "success" | "error";
export type Coordinates = [number, number];

export interface RouteLayerState {
  status: "loading" | "ready" | "error";
  route?: RouteDetails;
  geometry?: RouteGeometry;
  error?: string;
}

interface LoadedRouteLayer {
  route: RouteDetails;
  geometry: RouteGeometry | null;
}

export const defaultPosition: Coordinates = [14.7167, 121.05];

export const stopTypeLabel = (stop: Pick<RouteStop, "stop_type">) =>
  stop.stop_type === "terminal"
    ? "Terminal"
    : stop.stop_type === "train_station"
      ? "Train station"
      : "Bus / jeepney stop";

// Haversine distance in meters between two [lat, lng] coordinates.
function getDistanceMeters(from: Coordinates, to: Coordinates): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(to[0] - from[0]);
  const dLng = toRadians(to[1] - from[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from[0])) *
      Math.cos(toRadians(to[0])) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function useTransitMap() {
  const geolocation =
    typeof navigator === "undefined" ? null : navigator.geolocation;

  const [currentPosition, setCurrentPosition] =
    useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(
    geolocation ? "loading" : "error"
  );
  const [locationError, setLocationError] = useState<string | null>(
    geolocation ? null : "Your browser does not support location access."
  );
  const [showLocationPopup, setShowLocationPopup] = useState(true);

  // Terminal data.
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalsLoading, setTerminalsLoading] = useState(true);

  // Route selection and route details.
  const [routeMapIndex, setRouteMapIndex] = useState<RouteMapIndex>({
    routes: [],
    points: [],
  });
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routeMapError, setRouteMapError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<RouteDetails | null>(null);
  const [selectedRouteStops, setSelectedRouteStops] = useState<RouteStop[]>([]);
  const [routeStopsLoading, setRouteStopsLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLayers, setRouteLayers] = useState<
    Record<number, RouteLayerState>
  >({});
  const [visibleRouteIds, setVisibleRouteIds] = useState<number[]>([]);
  const [routeLinesVisible, setRouteLinesVisible] = useState(true);
  const [selectedPlacePoint, setSelectedPlacePoint] =
    useState<RouteMapPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const pendingBoardingPoint = useRef<Pick<
    RouteMapPoint,
    "kind" | "ref_id"
  > | null>(null);
  const routeLayerCache = useRef(new Map<number, Promise<LoadedRouteLayer>>());

  const mapPoints = useMemo(
    () => mergeMapTerminals(routeMapIndex, terminals),
    [routeMapIndex, terminals]
  );
  const selectedPlace = useMemo(
    () =>
      selectedPlacePoint
        ? mapPoints.find(
            (point) =>
              point.kind === selectedPlacePoint.kind &&
              point.ref_id === selectedPlacePoint.ref_id
          ) ?? selectedPlacePoint
        : null,
    [mapPoints, selectedPlacePoint]
  );
  const searchResults = useMemo(
    () => searchRouteMapItems(routeMapIndex.routes, mapPoints, searchQuery),
    [routeMapIndex.routes, mapPoints, searchQuery]
  );
  const selectedRouteLayer = selectedRouteId
    ? routeLayers[Number(selectedRouteId)]
    : undefined;
  const selectedRouteGeometry = selectedRouteLayer?.geometry;
  const routeDistanceMeters =
    selectedRouteGeometry?.totalDistanceMeters ?? null;
  const routeDurationSeconds = selectedRouteGeometry?.durationSeconds ?? null;
  const stopDistances = selectedRouteGeometry?.stopDistances ?? [];
  const stopMapPositions = selectedRouteGeometry?.stopMapPositions ?? [];
  const roadRouteLoading = selectedRouteLayer?.status === "loading";
  const displayedRouteIds = useMemo(
    () =>
      getDisplayedRouteIds(visibleRouteIds, selectedRouteId, routeLinesVisible),
    [routeLinesVisible, selectedRouteId, visibleRouteIds]
  );
  const displayedRouteLayers = useMemo(
    () =>
      displayedRouteIds.flatMap((routeId) => {
        const layer = routeLayers[routeId];
        if (!layer?.route || !layer.geometry) return [];
        return [{ routeId, route: layer.route, geometry: layer.geometry }];
      }),
    [displayedRouteIds, routeLayers]
  );
  const coincidentRouteIdsByGeometry = useMemo(() => {
    const groups = new Map<string, number[]>();

    displayedRouteLayers.forEach(({ routeId, geometry }) => {
      const key = getRouteGeometryKey(geometry.positions);
      const routeIds = groups.get(key) ?? [];
      routeIds.push(routeId);
      groups.set(key, routeIds);
    });

    return groups;
  }, [displayedRouteLayers]);
  const displayedRoutePositions = useMemo(
    () => displayedRouteLayers.flatMap((layer) => layer.geometry?.positions ?? []),
    [displayedRouteLayers]
  );

  // Trip selection + fares.
  const [boardingIndex, setBoardingIndex] = useState<number | null>(null);
  const [destinationIndex, setDestinationIndex] = useState<number | null>(null);
  const [fareOptions, setFareOptions] = useState<TransportFareOption[]>([]);
  const [fareOptionsLoading, setFareOptionsLoading] = useState(false);
  const [fareOptionsError, setFareOptionsError] = useState<string | null>(null);
  const [railFare, setRailFare] = useState<RailFare | null>(null);
  const [railFareLoading, setRailFareLoading] = useState(false);
  const [railFareError, setRailFareError] = useState<string | null>(null);

  // Photos for terminals and stops, keyed "terminal-<id>" / "stop-<id>".
  const [pointImages, setPointImages] = useState<Record<string, PointImage>>(
    {}
  );

  // Watch the device's current location.
  useEffect(() => {
    if (!geolocation) return;

    let bestAccuracy = Number.POSITIVE_INFINITY;
    let hasReceivedPosition = false;
    let lastPosition: Coordinates | null = null;

    const watchId = geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        const next: Coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        // Keep the best (most accurate) fix, but also refresh when the
        // device has actually moved so a shifted location retriggers routing.
        const movedEnough =
          lastPosition === null || getDistanceMeters(lastPosition, next) >= 15;
        const betterAccuracy = !hasReceivedPosition || accuracy < bestAccuracy;

        if (hasReceivedPosition && !movedEnough && !betterAccuracy) return;

        hasReceivedPosition = true;
        bestAccuracy = Math.min(bestAccuracy, accuracy);
        lastPosition = next;

        setCurrentPosition(next);
        setLocationStatus("success");
        setLocationError(null);
      },
      (error) => {
        if (hasReceivedPosition) return;

        let message: string;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            message =
              "Location permission denied. Enable it in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            message = "Your current location is unavailable.";
            break;
          case error.TIMEOUT:
            message = "Location request timed out. Please try again.";
            break;
          default:
            message = "Unable to determine your current location.";
        }

        setLocationStatus("error");
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    const popupTimer = window.setTimeout(() => {
      setShowLocationPopup(false);
    }, 4000);

    return () => {
      geolocation.clearWatch(watchId);
      window.clearTimeout(popupTimer);
    };
  }, [geolocation]);

  // Load active terminals.
  useEffect(() => {
    let active = true;

    async function loadTerminals() {
      setTerminalsLoading(true);
      setTerminalError(null);

      try {
        const data = await getTerminals();
        if (active) setTerminals(data);
      } catch (error: unknown) {
        if (active) {
          setTerminalError(
            error instanceof Error ? error.message : "Unable to load terminals."
          );
        }
      } finally {
        if (active) setTerminalsLoading(false);
      }
    }

    void loadTerminals();

    return () => {
      active = false;
    };
  }, []);

  // Load active routes and their visible map points.
  useEffect(() => {
    let active = true;

    async function loadRouteMap() {
      setRoutesLoading(true);
      setRouteMapError(null);

      try {
        const index = await getRouteMapIndex();
        if (active) setRouteMapIndex(index);
      } catch (error: unknown) {
        if (active) {
          setRouteMapError(
            error instanceof Error
              ? error.message
              : "Unable to load routes and map points."
          );
        }
      } finally {
        if (active) setRoutesLoading(false);
      }
    }

    void loadRouteMap();

    return () => {
      active = false;
    };
  }, []);

  const loadRouteLayer = useCallback(
    (routeId: number): Promise<LoadedRouteLayer> => {
      const cached = routeLayerCache.current.get(routeId);
      if (cached) return cached;

      setRouteLayers((current) => ({
        ...current,
        [routeId]: { ...current[routeId], status: "loading", error: undefined },
      }));

      const request = (async (): Promise<LoadedRouteLayer> => {
        const route = await getRouteDetails(routeId);
        setRouteLayers((current) => ({
          ...current,
          [routeId]: { status: "loading", route },
        }));

        try {
          const geometry = await getRouteGeometry(route);
          setRouteLayers((current) => ({
            ...current,
            [routeId]: { status: "ready", route, geometry },
          }));
          return { route, geometry };
        } catch (error: unknown) {
          setRouteLayers((current) => ({
            ...current,
            [routeId]: {
              status: "error",
              route,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to calculate this route's geometry.",
            },
          }));
          routeLayerCache.current.delete(routeId);
          return { route, geometry: null };
        }
      })();

      routeLayerCache.current.set(routeId, request);
      void request.catch((error: unknown) => {
        if (routeLayerCache.current.get(routeId) === request) {
          routeLayerCache.current.delete(routeId);
        }
        setRouteLayers((current) => ({
          ...current,
          [routeId]: {
            ...current[routeId],
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Unable to load this route.",
          },
        }));
      });

      return request;
    },
    []
  );

  const loadVisibleRouteLayers = useCallback(
    (routeIds: number[]) => {
      const uniqueIds = [...new Set(routeIds)];
      setVisibleRouteIds(uniqueIds);
      setRouteLinesVisible(uniqueIds.length > 0);
      uniqueIds.forEach((routeId) => {
        void loadRouteLayer(routeId).catch(() => undefined);
      });
    },
    [loadRouteLayer]
  );

  // Load route details (type, variant, ordered stops) when the selection changes.
  useEffect(() => {
    let active = true;

    async function loadSelectedRoute() {
      setSelectedRoute(null);
      setSelectedRouteStops([]);
      setBoardingIndex(null);
      setDestinationIndex(null);
      setFareOptions([]);
      setRailFare(null);
      setFareOptionsError(null);
      setFareOptionsLoading(false);
      setRailFareError(null);
      setRailFareLoading(false);
      setRouteError(null);
      setRouteStopsLoading(false);

      if (!selectedRouteId) {
        pendingBoardingPoint.current = null;
        return;
      }

      setRouteStopsLoading(true);

      try {
        const { route: details } = await loadRouteLayer(Number(selectedRouteId));

        if (active) {
          const pendingPoint = pendingBoardingPoint.current;
          pendingBoardingPoint.current = null;

          setSelectedRoute(details);
          setSelectedRouteStops(details.route_stops);

          if (pendingPoint) {
            const index = findRouteStopIndex(details.route_stops, pendingPoint);
            if (index !== null) setBoardingIndex(index);
          }
        }
      } catch (error: unknown) {
        if (active) {
          pendingBoardingPoint.current = null;
          setRouteError(
            error instanceof Error ? error.message : "Unable to load this route."
          );
        }
      } finally {
        if (active) setRouteStopsLoading(false);
      }
    }

    void loadSelectedRoute();

    return () => {
      active = false;
    };
  }, [loadRouteLayer, selectedRouteId]);

  // Load all active fare variants and matching rules for this route's area.
  useEffect(() => {
    let active = true;

    async function loadFareOptions() {
      setFareOptions([]);
      setFareOptionsError(null);

      if (!selectedRoute) {
        setFareOptionsLoading(false);
        return;
      }

      setFareOptionsLoading(true);

      try {
        const options = await getTransportFareOptions(
          selectedRoute.transport_type_id,
          selectedRoute.fare_area_id
        );
        if (active) setFareOptions(options);
      } catch (error: unknown) {
        if (active) {
          setFareOptionsError(
            error instanceof Error
              ? error.message
              : "Unable to load fare comparisons."
          );
        }
      } finally {
        if (active) setFareOptionsLoading(false);
      }
    }

    void loadFareOptions();

    return () => {
      active = false;
    };
  }, [selectedRoute]);

  // Rail: look up the station-to-station fare for the chosen pair.
  useEffect(() => {
    let active = true;

    async function loadRailFare() {
      if (
        !selectedRoute ||
        selectedRoute.transport_variants.fare_model !== "matrix"
      ) {
        return;
      }

      setRailFare(null);
      setRailFareError(null);
      setRailFareLoading(false);

      if (boardingIndex === null || destinationIndex === null) return;

      const board = selectedRouteStops[boardingIndex];
      const alight = selectedRouteStops[destinationIndex];

      if (!board || !alight) return;

      if (board.kind !== "stop" || alight.kind !== "stop") {
        setRailFareError("Rail fares are only available between stations.");
        return;
      }

      setRailFareLoading(true);

      try {
        const fare = await getRailFare(
          selectedRoute.id,
          board.ref_id,
          alight.ref_id
        );
        if (active) setRailFare(fare);
      } catch (error: unknown) {
        if (active) {
          setRailFareError(
            error instanceof Error
              ? error.message
              : "Unable to load the rail fare."
          );
        }
      } finally {
        if (active) setRailFareLoading(false);
      }
    }

    void loadRailFare();

    return () => {
      active = false;
    };
  }, [selectedRoute, selectedRouteStops, boardingIndex, destinationIndex]);

  // Load photos for terminals, selected-route stops, and the open place.
  useEffect(() => {
    let active = true;

    async function loadPointImages() {
      const terminalIds = terminals.map((terminal) => terminal.id);
      const stopIds = selectedRouteStops
        .filter((stop) => stop.kind === "stop")
        .map((stop) => stop.ref_id);
      if (selectedPlace?.kind === "terminal") {
        terminalIds.push(selectedPlace.ref_id);
      } else if (selectedPlace?.kind === "stop") {
        stopIds.push(selectedPlace.ref_id);
      }

      try {
        const images = await getPointImages(terminalIds, stopIds);
        if (active) setPointImages(images);
      } catch {
        // Photos are optional, so a failure just means no image in the popup.
        if (active) setPointImages({});
      }
    }

    void loadPointImages();

    return () => {
      active = false;
    };
  }, [terminals, selectedRouteStops, selectedPlace]);

  // Derived route display values.
  const routeColor = selectedRoute?.transport_types.color ?? "#2563eb";
  const isRailRoute = selectedRoute?.transport_variants.fare_model === "matrix";
  const originName = selectedRouteStops[0]?.name;
  const destinationName =
    selectedRouteStops[selectedRouteStops.length - 1]?.name;
  const selectedPlaceImage = selectedPlace
    ? pointImages[`${selectedPlace.kind}-${selectedPlace.ref_id}`]
    : undefined;

  // Trip + fare.
  const boardingStop =
    boardingIndex !== null ? selectedRouteStops[boardingIndex] : null;
  const destinationStop =
    destinationIndex !== null ? selectedRouteStops[destinationIndex] : null;
  const hasTripSegment =
    !!selectedRoute &&
    boardingIndex !== null &&
    destinationIndex !== null &&
    destinationIndex !== boardingIndex &&
    boardingStop?.route_id === selectedRoute.id &&
    destinationStop?.route_id === selectedRoute.id;

  const tripDistanceMeters = hasTripSegment
    ? getTripDistanceMeters(stopDistances, boardingIndex, destinationIndex)
    : null;

  const fareOptionEstimates =
    hasTripSegment && tripDistanceMeters !== null
      ? calculateFareOptionEstimates(fareOptions, tripDistanceMeters)
      : [];
  const fareCards = buildFareCards(
    fareOptionEstimates,
    railFare,
    isRailRoute ? selectedRoute?.transport_variants.id ?? null : null
  );

  const handleTripStop = (index: number) => {
    const selection = selectTripStop({ boardingIndex, destinationIndex }, index);
    setBoardingIndex(selection.boardingIndex);
    setDestinationIndex(selection.destinationIndex);
  };

  const clearTrip = () => {
    pendingBoardingPoint.current = null;
    setBoardingIndex(null);
    setDestinationIndex(null);
    setRouteLinesVisible(false);
  };

  const handlePlaceSelect = (point: RouteMapPoint) => {
    setSelectedPlacePoint(point);
    loadVisibleRouteLayers(point.routes.map(({ route }) => route.id));
    setShowSearchResults(false);
    setSearchQuery("");
    setActiveSearchIndex(0);

    if (selectedRoute) {
      const routeStopIndex = findRouteStopIndex(selectedRouteStops, point);
      if (routeStopIndex !== null) {
        if (
          isRepeatedBoardingPoint(
            { boardingIndex, destinationIndex },
            routeStopIndex
          )
        ) {
          clearTrip();
          return;
        }

        handleTripStop(routeStopIndex);
      }
      return;
    }

    if (selectedRouteId) {
      const activeRouteId = Number(selectedRouteId);
      if (point.routes.some(({ route }) => route.id === activeRouteId)) {
        pendingBoardingPoint.current = {
          kind: point.kind,
          ref_id: point.ref_id,
        };
      }
      return;
    }

    const uniqueRoute = getUniqueServingRoute(point);
    if (!uniqueRoute) return;

    pendingBoardingPoint.current = {
      kind: point.kind,
      ref_id: point.ref_id,
    };
    setSelectedRouteId(String(uniqueRoute.id));
  };

  const handleRouteLineSelect = (routeId: number) => {
    setRouteLinesVisible(true);
    const nextRouteId = String(routeId);
    if (selectedRouteId === nextRouteId) return;
    pendingBoardingPoint.current = null;
    setSelectedRouteId(nextRouteId);
  };

  const handleSearchResultSelect = (result: RouteMapSearchResult) => {
    setSearchQuery("");
    setShowSearchResults(false);
    setActiveSearchIndex(0);

    if (result.kind === "route") {
      pendingBoardingPoint.current = null;
      setSelectedPlacePoint(null);
      loadVisibleRouteLayers([result.route.id]);
      setBoardingIndex(null);
      setDestinationIndex(null);
      setSelectedRouteId(String(result.route.id));
      return;
    }

    handlePlaceSelect(result.point);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setShowSearchResults(false);
      return;
    }

    if (!showSearchResults || searchResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchIndex((index) =>
        index >= searchResults.length - 1 ? 0 : index + 1
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchIndex((index) =>
        index <= 0 ? searchResults.length - 1 : index - 1
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleSearchResultSelect(searchResults[activeSearchIndex]);
    }
  };

  // Boarding/destination keep their role colors (green/red) via getEndpointMapIcon;
  // ordinary route stops use the route's configured transport color.
  const pointIcon = (index: number, stop: RouteStop) => {
    const vehicleType = getMapVehicleType(
      selectedRoute?.transport_types.name ?? ""
    );
    if (index === boardingIndex) {
      return getEndpointMapIcon("boarding", vehicleType);
    }
    if (index === destinationIndex) {
      return getEndpointMapIcon("destination", vehicleType);
    }
    if (stop.kind === "terminal") return getMapIcon("terminal");

    return stop.stop_type === "train_station"
      ? getMapIcon("train_station", routeColor)
      : getMapIcon("stop", routeColor);
  };

  return {
    // location
    currentPosition,
    locationStatus,
    locationError,
    showLocationPopup,
    // loading / errors
    terminalsLoading,
    terminalError,
    routesLoading,
    routeMapError,
    routeError,
    routeStopsLoading,
    roadRouteLoading,
    routeMapIndex,
    // map data
    mapPoints,
    selectedPlace,
    selectedPlaceImage,
    displayedRouteLayers,
    displayedRoutePositions,
    coincidentRouteIdsByGeometry,
    stopMapPositions,
    // selection
    selectedRouteId,
    selectedRoute,
    selectedRouteStops,
    boardingIndex,
    destinationIndex,
    boardingStop,
    destinationStop,
    routeColor,
    isRailRoute,
    originName,
    destinationName,
    routeDistanceMeters,
    routeDurationSeconds,
    // fares
    fareOptions,
    fareOptionsLoading,
    fareOptionsError,
    railFareLoading,
    railFareError,
    hasTripSegment,
    tripDistanceMeters,
    fareCards,
    // search
    searchQuery,
    setSearchQuery,
    searchResults,
    showSearchResults,
    setShowSearchResults,
    activeSearchIndex,
    setActiveSearchIndex,
    // actions
    pointIcon,
    handlePlaceSelect,
    handleRouteLineSelect,
    handleSearchResultSelect,
    handleSearchKeyDown,
    handleListPick: handleTripStop,
    clearTrip,
    clearSelectedRoute: () => setSelectedRouteId(""),
    closePlace: () => setSelectedPlacePoint(null),
  };
}

export type TransitMapController = ReturnType<typeof useTransitMap>;