import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";

// ============================================================
// DATA SERVICES
// ============================================================

import { getTerminals } from "@/lib/terminals";
import type { Terminal } from "@/lib/terminals";

import { getStops } from "@/lib/stops";
import type { Stop } from "@/lib/stops";

import {
  getRouteDetails,
  getRouteMapIndex,
} from "@/lib/routes";

import type {
  RouteDetails,
  RouteStop,
} from "@/lib/routes";

// ============================================================
// ROUTE GEOMETRY
// ============================================================

import {
  getRouteGeometry,
  getRouteGeometryKey,
  getRouteGeometrySegment,
} from "@/lib/routeGeometry";

import type {
  RouteGeometry,
  RouteGeometrySegment,
} from "@/lib/routeGeometry";

// ============================================================
// ROUTE MAP UTILITIES
// ============================================================

import {
  findRouteStopIndex,
  getDisplayedRouteIds,
  getTripDistanceMeters,
  getUniqueServingRoute,
  isRepeatedBoardingPoint,
  mergeMapLocations,
  resolveSavedMapSelection,
  searchRouteMapItems,
  selectTripStop,
} from "@/lib/routeMap";

import type {
  ParsedSavedMapSelection,
  RouteMapIndex,
  RouteMapPoint,
  RouteMapSearchResult,
} from "@/lib/routeMap";

// ============================================================
// SAVED JOURNEY TYPES
// ============================================================

import type {
  SavedJourneyEndpoint,
} from "@/lib/savedItems";

// ============================================================
// RECENT SEARCHES
// ============================================================

import { getRecentSearchItem } from "@/lib/recentSearches";

import type {
  RecentSearchSelectionSource,
} from "@/lib/recentSearches";

import {
  useRecentSearches,
} from "@/components/recent-searches/recentSearchesStore";

// ============================================================
// FARE CALCULATIONS
// ============================================================

import {
  buildFareCards,
  calculateFareOptionEstimates,
} from "@/lib/fareCalculations";

import {
  getRailFare,
  getRouteFareOption,
} from "@/lib/fares";

import type {
  RailFare,
  TransportFareOption,
} from "@/lib/fares";

// ============================================================
// MAP ICONS
// ============================================================

import {
  getEndpointMapIcon,
  getMapIcon,
  getMapVehicleType,
} from "@/lib/mapIcons";

// ============================================================
// MAP IMAGES
// ============================================================

import { getPointImages } from "@/lib/mapImages";
import type { PointImage } from "@/lib/mapImages";

// ============================================================
// CURRENT LOCATION
// ============================================================

import {
  createCurrentLocationRequester,
} from "@/lib/currentLocation";

// ============================================================
// TYPES
// ============================================================

export type LocationStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

export type Coordinates = [
  number,
  number,
];

export interface PinnedMapLocation {
  coordinates: Coordinates;
  label: string;
}

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

interface PendingSavedJourneySelection {
  routeId: number;
  origin: SavedJourneyEndpoint;
  destination: SavedJourneyEndpoint;
}

export type PhotoPointSelectionSource = "map" | "route-list";

export interface PhotoPointSelectionEvent {
  sequence: number;
  source: PhotoPointSelectionSource;
  place: Pick<RouteMapPoint, "kind" | "ref_id" | "name">;
}

// ============================================================
// CONSTANTS
// ============================================================

export const defaultPosition: Coordinates = [
  14.7167,
  121.05,
];

// ============================================================
// HELPERS
// ============================================================

export const stopTypeLabel = (
  stop: Pick<RouteStop, "stop_type">,
) =>
  stop.stop_type === "terminal"
    ? "Terminal"
    : stop.stop_type === "train_station"
      ? "Train station"
      : "Bus / jeepney stop";

/**
 * Saved journey endpoints use:
 *
 * {
 *   kind: "stop" | "terminal",
 *   id: number
 * }
 *
 * RouteMapPoint and findRouteStopIndex use:
 *
 * {
 *   kind: "stop" | "terminal",
 *   ref_id: number
 * }
 *
 * Convert a saved endpoint before looking it up in route_stops.
 */
function toRoutePointReference(
  endpoint: SavedJourneyEndpoint,
): Pick<RouteMapPoint, "kind" | "ref_id"> {
  return {
    kind: endpoint.kind,
    ref_id: endpoint.id,
  };
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useTransitMap(
  currentUserId: string | null | undefined = undefined,
) {
  const {
    record: recordRecentSearch,
  } = useRecentSearches();

  // ==========================================================
  // CURRENT LOCATION
  // ==========================================================

  const geolocation =
    typeof navigator === "undefined"
      ? null
      : navigator.geolocation;

  const requestLocation = useMemo(
    () => createCurrentLocationRequester(geolocation),
    [geolocation],
  );

  const [currentPosition, setCurrentPosition] =
    useState<Coordinates | null>(null);

  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("idle");

  const [locationError, setLocationError] =
    useState<string | null>(null);

  const [showLocationPopup, setShowLocationPopup] =
    useState(false);

  const locationRequestInFlight = useRef(false);

  const locationPopupTimer = useRef<number | null>(null);

  // ==========================================================
  // INDEPENDENT MAP LOCATION DATA
  // ==========================================================

  // ----------------------------------------------------------
  // STOPS
  // ----------------------------------------------------------

  const [stops, setStops] = useState<Stop[]>([]);

  const [stopError, setStopError] =
    useState<string | null>(null);

  const [stopsLoading, setStopsLoading] =
    useState(true);

  // ----------------------------------------------------------
  // TERMINALS
  // ----------------------------------------------------------

  const [terminals, setTerminals] =
    useState<Terminal[]>([]);

  const [terminalError, setTerminalError] =
    useState<string | null>(null);

  const [terminalsLoading, setTerminalsLoading] =
    useState(true);

  // ==========================================================
  // ROUTE MAP DATA
  // ==========================================================

  const [routeMapIndex, setRouteMapIndex] =
    useState<RouteMapIndex>({
      routes: [],
      points: [],
    });

  const [routesLoading, setRoutesLoading] =
    useState(true);

  const [routeMapError, setRouteMapError] =
    useState<string | null>(null);

  // ==========================================================
  // SELECTED ROUTE
  // ==========================================================

  const [selectedRouteId, setSelectedRouteId] =
    useState("");

  /**
   * Explicitly restarts selected-route loading.
   *
   * Used when a saved journey is requested for a route
   * that is already selected but whose details are not ready.
   */
  const [
    selectedRouteLoadVersion,
    setSelectedRouteLoadVersion,
  ] = useState(0);

  const [selectedRoute, setSelectedRoute] =
    useState<RouteDetails | null>(null);

  const [selectedRouteStops, setSelectedRouteStops] =
    useState<RouteStop[]>([]);

  const [routeStopsLoading, setRouteStopsLoading] =
    useState(false);

  const [routeError, setRouteError] =
    useState<string | null>(null);

  // ==========================================================
  // ROUTE LAYERS
  // ==========================================================

  const [routeLayers, setRouteLayers] =
    useState<Record<number, RouteLayerState>>({});

  const [visibleRouteIds, setVisibleRouteIds] =
    useState<number[]>([]);

  const [routeLinesVisible, setRouteLinesVisible] =
    useState(true);

  // ==========================================================
  // PLACE AND MAP SELECTION
  // ==========================================================

  const [selectedPlacePoint, setSelectedPlacePoint] =
    useState<RouteMapPoint | null>(null);

  const [pinnedMapLocation, setPinnedMapLocation] =
    useState<PinnedMapLocation | null>(null);

  const [selectionError, setSelectionError] =
    useState<string | null>(null);

  // ==========================================================
  // SEARCH
  // ==========================================================

  const [searchQuery, setSearchQuery] =
    useState("");

  const [showSearchResults, setShowSearchResults] =
    useState(false);

  const [activeSearchIndex, setActiveSearchIndex] =
    useState(0);

  // ==========================================================
  // PENDING SELECTIONS
  // ==========================================================

  /**
   * Existing single-point restoration.
   *
   * Used when an individual stop is selected while its
   * serving route still needs to load.
   */
  const pendingBoardingPoint = useRef<
    Pick<RouteMapPoint, "kind" | "ref_id"> | null
  >(null);

  /**
   * Pending two-endpoint journey restoration.
   *
   * Used when opening a saved passenger journey.
   */
  const pendingSavedJourney =
    useRef<PendingSavedJourneySelection | null>(null);

  // ==========================================================
  // ROUTE LAYER CACHE
  // ==========================================================

  const routeLayerCache = useRef(
    new Map<number, Promise<LoadedRouteLayer>>(),
  );

  // ==========================================================
  // DERIVED UNIFIED MAP POINTS
  // ==========================================================

  /**
   * Combines three independent data sources:
   *
   * 1. Route-associated locations from routeMapIndex.
   * 2. Independently loaded public stops.
   * 3. Independently loaded public terminals.
   *
   * Existing route associations remain intact.
   *
   * Locations without route associations are still included
   * and remain available for map discovery and bookmarking.
   */
  const mapPoints = useMemo(
    () => mergeMapLocations(routeMapIndex, stops, terminals),
    [routeMapIndex, stops, terminals],
  );

  const selectedPlace = useMemo(
    () =>
      selectedPlacePoint
        ? mapPoints.find(
            (point) =>
              point.kind === selectedPlacePoint.kind &&
              point.ref_id === selectedPlacePoint.ref_id,
          ) ?? selectedPlacePoint
        : null,
    [mapPoints, selectedPlacePoint],
  );

  const searchResults = useMemo(
    () =>
      searchRouteMapItems(
        routeMapIndex.routes,
        mapPoints,
        searchQuery,
      ),
    [routeMapIndex.routes, mapPoints, searchQuery],
  );

  // ==========================================================
  // SELECTED ROUTE GEOMETRY
  // ==========================================================

  const selectedRouteLayer = selectedRouteId
    ? routeLayers[Number(selectedRouteId)]
    : undefined;

  const selectedRouteGeometry =
    selectedRouteLayer?.geometry;

  /**
   * Full-route measurements.
   *
   * These remain available internally, even while the map
   * displays only a selected passenger journey.
   */
  const routeDistanceMeters =
    selectedRouteGeometry?.totalDistanceMeters ?? null;

  const routeDurationSeconds =
    selectedRouteGeometry?.durationSeconds ?? null;

  const stopDistances =
    selectedRouteGeometry?.stopDistances ?? [];

  const stopMapPositions =
    selectedRouteGeometry?.stopMapPositions ?? [];

  const roadRouteLoading =
    selectedRouteLayer?.status === "loading";

  // ==========================================================
  // DISPLAYED ROUTE LAYERS
  // ==========================================================

  const displayedRouteIds = useMemo(
    () =>
      getDisplayedRouteIds(
        visibleRouteIds,
        selectedRouteId,
        routeLinesVisible,
      ),
    [
      routeLinesVisible,
      selectedRouteId,
      visibleRouteIds,
    ],
  );

  const displayedRouteLayers = useMemo(
    () =>
      displayedRouteIds.flatMap((routeId) => {
        const layer = routeLayers[routeId];

        if (!layer?.route || !layer.geometry) {
          return [];
        }

        return [
          {
            routeId,
            route: layer.route,
            geometry: layer.geometry,
          },
        ];
      }),
    [
      displayedRouteIds,
      routeLayers,
    ],
  );

  const coincidentRouteIdsByGeometry = useMemo(() => {
    const groups = new Map<string, number[]>();

    displayedRouteLayers.forEach(
      ({ routeId, geometry }) => {
        const key = getRouteGeometryKey(geometry.positions);

        const routeIds = groups.get(key) ?? [];

        routeIds.push(routeId);

        groups.set(key, routeIds);
      },
    );

    return groups;
  }, [displayedRouteLayers]);

  const displayedRoutePositions = useMemo(
    () =>
      displayedRouteLayers.flatMap(
        (layer) => layer.geometry?.positions ?? [],
      ),
    [displayedRouteLayers],
  );

  // ==========================================================
  // TRIP SELECTION
  // ==========================================================

  const [boardingIndex, setBoardingIndex] =
    useState<number | null>(null);

  const [destinationIndex, setDestinationIndex] =
    useState<number | null>(null);

  // ==========================================================
  // FARE CONFIGURATION
  // ==========================================================

  const [fareOption, setFareOption] =
    useState<TransportFareOption | null>(null);

  const [fareOptionLoading, setFareOptionLoading] =
    useState(false);

  const [fareOptionError, setFareOptionError] =
    useState<string | null>(null);

  const [railFare, setRailFare] =
    useState<RailFare | null>(null);

  const [railFareLoading, setRailFareLoading] =
    useState(false);

  const [railFareError, setRailFareError] =
    useState<string | null>(null);

  // ==========================================================
  // POINT IMAGES
  // ==========================================================

  /**
   * Retrieved public images are cached by point key for the
   * current place-details session:
   *
   * terminal-<id>
   * stop-<id>
   *
   * Each selection loads only that point. Results are merged
   * into the cache so earlier galleries remain available while
   * the user selects additional locations.
   */
  const [pointImages, setPointImages] =
    useState<Record<string, PointImage[]>>({});

  const [photoSelectionEvent, setPhotoSelectionEvent] =
    useState<PhotoPointSelectionEvent | null>(null);

  const photoSelectionSequence = useRef(0);
  const pointImageRequestGeneration = useRef(0);
  const requestedPointImageKeys = useRef(new Set<string>());

  const clearPhotoSession = () => {
    pointImageRequestGeneration.current += 1;
    requestedPointImageKeys.current.clear();
    setPointImages({});
    setPhotoSelectionEvent(null);
  };

  const recordPhotoPointSelection = (
    point: RouteMapPoint,
    source: PhotoPointSelectionSource,
  ) => {
    photoSelectionSequence.current += 1;

    setPhotoSelectionEvent({
      sequence: photoSelectionSequence.current,
      source,
      place: {
        kind: point.kind,
        ref_id: point.ref_id,
        name: point.name,
      },
    });

    const pointKey = `${point.kind}-${point.ref_id}`;

    if (requestedPointImageKeys.current.has(pointKey)) {
      return;
    }

    requestedPointImageKeys.current.add(pointKey);

    const requestGeneration = pointImageRequestGeneration.current;
    const terminalIds = point.kind === "terminal" ? [point.ref_id] : [];
    const stopIds = point.kind === "stop" ? [point.ref_id] : [];

    void getPointImages(terminalIds, stopIds)
      .then((images) => {
        // Ignore responses from a place-details session that has
        // already been closed.
        if (requestGeneration !== pointImageRequestGeneration.current) {
          return;
        }

        setPointImages((current) => ({
          ...current,
          ...images,
        }));
      })
      .catch(() => {
        // Photos are optional. A failed request should not affect
        // the map. Remove the key so selecting it again can retry.
        if (requestGeneration === pointImageRequestGeneration.current) {
          requestedPointImageKeys.current.delete(pointKey);
        }
      });
  };

  // ==========================================================
  // CURRENT LOCATION REQUEST
  // ==========================================================

  const requestCurrentLocation = useCallback(async () => {
    if (locationRequestInFlight.current) {
      return;
    }

    locationRequestInFlight.current = true;

    if (locationPopupTimer.current !== null) {
      window.clearTimeout(locationPopupTimer.current);
      locationPopupTimer.current = null;
    }

    setShowLocationPopup(true);
    setLocationStatus("loading");
    setLocationError(null);

    try {
      setCurrentPosition(await requestLocation());
      setLocationStatus("success");
    } catch (cause: unknown) {
      setLocationStatus("error");

      setLocationError(
        cause instanceof Error
          ? cause.message
          : "Unable to determine your current location.",
      );
    } finally {
      locationRequestInFlight.current = false;

      locationPopupTimer.current = window.setTimeout(() => {
        setShowLocationPopup(false);
        locationPopupTimer.current = null;
      }, 4000);
    }
  }, [requestLocation]);

  // ==========================================================
  // LOCATION POPUP CLEANUP
  // ==========================================================

  useEffect(
    () => () => {
      if (locationPopupTimer.current !== null) {
        window.clearTimeout(locationPopupTimer.current);
      }
    },
    [],
  );

  // ==========================================================
  // LOAD ACTIVE TERMINALS
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadTerminals() {
      setTerminalsLoading(true);
      setTerminalError(null);

      try {
        const data = await getTerminals(currentUserId);

        if (active) {
          setTerminals(data);
        }
      } catch (error: unknown) {
        if (active) {
          setTerminalError(
            error instanceof Error
              ? error.message
              : "Unable to load terminals.",
          );
        }
      } finally {
        if (active) {
          setTerminalsLoading(false);
        }
      }
    }

    void loadTerminals();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  // ==========================================================
  // LOAD ACTIVE INDEPENDENT STOPS
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadStops() {
      setStopsLoading(true);
      setStopError(null);

      try {
        const data = await getStops(currentUserId);

        if (active) {
          setStops(data);
        }
      } catch (error: unknown) {
        if (active) {
          setStopError(
            error instanceof Error
              ? error.message
              : "Unable to load independent stops.",
          );
        }
      } finally {
        if (active) {
          setStopsLoading(false);
        }
      }
    }

    void loadStops();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  // ==========================================================
  // LOAD ACTIVE ROUTES AND MAP POINTS
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadRouteMap() {
      setRoutesLoading(true);
      setRouteMapError(null);

      try {
        const index = await getRouteMapIndex(currentUserId);

        if (active) {
          setRouteMapIndex(index);
        }
      } catch (error: unknown) {
        if (active) {
          setRouteMapError(
            error instanceof Error
              ? error.message
              : "Unable to load routes and map points.",
          );
        }
      } finally {
        if (active) {
          setRoutesLoading(false);
        }
      }
    }

    void loadRouteMap();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  // ==========================================================
  // LOAD ROUTE LAYER
  // ==========================================================

  const loadRouteLayer = useCallback(
    (routeId: number): Promise<LoadedRouteLayer> => {
      const cached = routeLayerCache.current.get(routeId);

      if (cached) {
        return cached;
      }

      setRouteLayers((current) => ({
        ...current,
        [routeId]: {
          ...current[routeId],
          status: "loading",
          error: undefined,
        },
      }));

      const request = (async (): Promise<LoadedRouteLayer> => {
        const route = await getRouteDetails(
          routeId,
          currentUserId,
        );

        setRouteLayers((current) => ({
          ...current,
          [routeId]: {
            status: "loading",
            route,
          },
        }));

        try {
          const geometry = await getRouteGeometry(route);

          setRouteLayers((current) => ({
            ...current,
            [routeId]: {
              status: "ready",
              route,
              geometry,
            },
          }));

          return {
            route,
            geometry,
          };
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

          return {
            route,
            geometry: null,
          };
        }
      })();

      routeLayerCache.current.set(routeId, request);

      void request.catch((error: unknown) => {
        if (
          routeLayerCache.current.get(routeId) === request
        ) {
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
    [currentUserId],
  );

  // ==========================================================
  // LOAD VISIBLE ROUTE LAYERS
  // ==========================================================

  const loadVisibleRouteLayers = useCallback(
    (routeIds: number[]) => {
      const uniqueIds = [...new Set(routeIds)];

      setVisibleRouteIds(uniqueIds);
      setRouteLinesVisible(uniqueIds.length > 0);

      uniqueIds.forEach((routeId) => {
        void loadRouteLayer(routeId).catch(() => undefined);
      });
    },
    [loadRouteLayer],
  );

  // ==========================================================
  // LOAD SELECTED ROUTE DETAILS AND RESTORE SELECTION
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadSelectedRoute() {
      // Reset values belonging to the previous selection.
      setSelectedRoute(null);
      setSelectedRouteStops([]);
      setBoardingIndex(null);
      setDestinationIndex(null);
      setFareOption(null);
      setRailFare(null);
      setFareOptionError(null);
      setFareOptionLoading(false);
      setRailFareError(null);
      setRailFareLoading(false);
      setRouteError(null);
      setRouteStopsLoading(false);

      if (!selectedRouteId) {
        pendingBoardingPoint.current = null;
        pendingSavedJourney.current = null;
        return;
      }

      const requestedRouteId = Number(selectedRouteId);

      setRouteStopsLoading(true);

      try {
        const { route: details } =
          await loadRouteLayer(requestedRouteId);

        if (!active) {
          return;
        }

        setSelectedRoute(details);
        setSelectedRouteStops(details.route_stops);

        // ----------------------------------------------------
        // RESTORE A SAVED JOURNEY
        // ----------------------------------------------------

        const pendingJourney = pendingSavedJourney.current;

        if (
          pendingJourney &&
          pendingJourney.routeId === details.id
        ) {
          pendingSavedJourney.current = null;
          pendingBoardingPoint.current = null;

          const originIndex = findRouteStopIndex(
            details.route_stops,
            toRoutePointReference(pendingJourney.origin),
          );

          const destinationIndex = findRouteStopIndex(
            details.route_stops,
            toRoutePointReference(pendingJourney.destination),
          );

          if (
            originIndex === null ||
            destinationIndex === null ||
            originIndex === destinationIndex
          ) {
            setBoardingIndex(null);
            setDestinationIndex(null);

            setSelectionError(
              "The saved journey's origin or destination is no longer available on this route.",
            );
          } else {
            setBoardingIndex(originIndex);
            setDestinationIndex(destinationIndex);
            setSelectionError(null);
          }
        } else {
          // --------------------------------------------------
          // RESTORE AN EXISTING SINGLE BOARDING POINT
          // --------------------------------------------------

          const pendingPoint = pendingBoardingPoint.current;

          pendingBoardingPoint.current = null;

          if (pendingPoint) {
            const index = findRouteStopIndex(
              details.route_stops,
              pendingPoint,
            );

            if (index !== null) {
              setBoardingIndex(index);
            }
          }
        }
      } catch (error: unknown) {
        if (active) {
          pendingBoardingPoint.current = null;

          if (
            pendingSavedJourney.current?.routeId ===
            requestedRouteId
          ) {
            pendingSavedJourney.current = null;
          }

          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load this route.",
          );
        }
      } finally {
        if (active) {
          setRouteStopsLoading(false);
        }
      }
    }

    void loadSelectedRoute();

    return () => {
      active = false;
    };
  }, [
    loadRouteLayer,
    selectedRouteId,
    selectedRouteLoadVersion,
  ]);

  // ==========================================================
  // LOAD ASSIGNED VEHICLE FARE CONFIGURATION
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadFareOption() {
      setFareOption(null);
      setFareOptionError(null);

      if (!selectedRoute) {
        setFareOptionLoading(false);
        return;
      }

      setFareOptionLoading(true);

      try {
        const option = await getRouteFareOption(
          selectedRoute.transport_variants.id,
          currentUserId,
        );

        if (active) {
          setFareOption(option);
        }
      } catch (error: unknown) {
        if (active) {
          setFareOptionError(
            error instanceof Error
              ? error.message
              : "Unable to load the assigned vehicle fare.",
          );
        }
      } finally {
        if (active) {
          setFareOptionLoading(false);
        }
      }
    }

    void loadFareOption();

    return () => {
      active = false;
    };
  }, [
    selectedRoute,
    currentUserId,
  ]);

  // ==========================================================
  // LOAD RAIL STATION-TO-STATION FARE
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadRailFare() {
      if (
        !selectedRoute ||
        selectedRoute.transport_variants.fare_model !== "matrix"
      ) {
        setRailFare(null);
        setRailFareError(null);
        setRailFareLoading(false);
        return;
      }

      setRailFare(null);
      setRailFareError(null);
      setRailFareLoading(false);

      if (
        boardingIndex === null ||
        destinationIndex === null
      ) {
        return;
      }

      const board = selectedRouteStops[boardingIndex];
      const alight = selectedRouteStops[destinationIndex];

      if (!board || !alight) {
        return;
      }

      if (
        board.kind !== "stop" ||
        alight.kind !== "stop"
      ) {
        setRailFareError(
          "Rail fares are only available between stations.",
        );
        return;
      }

      setRailFareLoading(true);

      try {
        const fare = await getRailFare(
          selectedRoute.id,
          board.ref_id,
          alight.ref_id,
          currentUserId,
        );

        if (active) {
          setRailFare(fare);
        }
      } catch (error: unknown) {
        if (active) {
          setRailFareError(
            error instanceof Error
              ? error.message
              : "Unable to load the rail fare.",
          );
        }
      } finally {
        if (active) {
          setRailFareLoading(false);
        }
      }
    }

    void loadRailFare();

    return () => {
      active = false;
    };
  }, [
    selectedRoute,
    selectedRouteStops,
    boardingIndex,
    destinationIndex,
    currentUserId,
  ]);

  // ==========================================================
  // POINT PHOTOS ARE LOADED ON SELECTION
  // ==========================================================

  // Photo requests are started by recordPhotoPointSelection().
  // Keeping each request keyed by location avoids loading every
  // route stop and allows multiple selected galleries to coexist.

  // ==========================================================
  // DERIVED ROUTE DISPLAY VALUES
  // ==========================================================

  const routeColor =
    selectedRoute?.transport_types.color ?? "#2563eb";

  const isRailRoute =
    selectedRoute?.transport_variants.fare_model === "matrix";

  const originName =
    selectedRouteStops[0]?.name;

  const destinationName =
    selectedRouteStops[
      selectedRouteStops.length - 1
    ]?.name;

  const selectedPlaceImages = selectedPlace
    ? pointImages[
        `${selectedPlace.kind}-${selectedPlace.ref_id}`
      ] ?? []
    : [];

  // Keep the original singular value for any existing consumers
  // that only need a representative image.
  const selectedPlaceImage =
    selectedPlaceImages[0];

  // ==========================================================
  // TRIP ENDPOINTS
  // ==========================================================

  const boardingStop =
    boardingIndex !== null
      ? selectedRouteStops[boardingIndex]
      : null;

  const destinationStop =
    destinationIndex !== null
      ? selectedRouteStops[destinationIndex]
      : null;

  const hasTripSegment =
    !!selectedRoute &&
    boardingIndex !== null &&
    destinationIndex !== null &&
    destinationIndex !== boardingIndex &&
    boardingStop?.route_id === selectedRoute.id &&
    destinationStop?.route_id === selectedRoute.id;

  // ==========================================================
  // JOURNEY GEOMETRY
  // ==========================================================

  /**
   * Prevent using geometry belonging to another route during
   * the short transition between route selections.
   */
  const selectedLayerMatchesRoute =
    !!selectedRoute &&
    selectedRoute.id === Number(selectedRouteId) &&
    selectedRouteLayer?.route?.id === selectedRoute.id;

  /**
   * Extracts the geometry between the chosen endpoints.
   *
   * The complete route geometry stays cached internally.
   * This segment is used for the passenger-facing map.
   */
  const journeyGeometry = useMemo<RouteGeometrySegment | null>(
    () => {
      if (
        !hasTripSegment ||
        !selectedLayerMatchesRoute ||
        !selectedRouteLayer?.geometry ||
        boardingIndex === null ||
        destinationIndex === null
      ) {
        return null;
      }

      return getRouteGeometrySegment(
        selectedRouteLayer.geometry,
        boardingIndex,
        destinationIndex,
      );
    }, [
      hasTripSegment,
      selectedLayerMatchesRoute,
      selectedRouteLayer?.geometry,
      boardingIndex,
      destinationIndex,
    ],
  );

  /**
   * An active passenger journey suppresses the full-route
   * display, including while a saved journey is being restored.
   *
   * The pending ref is accompanied by a state update whenever
   * a pending saved journey is created, ensuring React renders
   * this transition.
   */
  const isJourneyViewActive =
    hasTripSegment ||
    pendingSavedJourney.current !== null;

  /**
   * Give the information panel a specific error when geometry
   * cannot be extracted.
   */
  const journeyGeometryError =
    !hasTripSegment ||
    !selectedLayerMatchesRoute ||
    !selectedRouteLayer
      ? null
      : selectedRouteLayer.status === "loading"
        ? null
        : selectedRouteLayer.status === "error"
          ? selectedRouteLayer.error ??
            "Unable to load the journey geometry."
          : !journeyGeometry
            ? "Unable to extract the journey segment. Check the selected endpoints and snapped waypoints."
            : null;

  /**
   * Road journey duration comes from OSRM leg durations.
   *
   * Rail duration remains unavailable until a rail timetable
   * or travel-time model is provided.
   */
  const tripDurationSeconds =
    journeyGeometry?.durationSeconds ?? null;

  // ==========================================================
  // TRIP DISTANCE
  // ==========================================================

  /**
   * Uses cumulative OSRM leg distances, not straight-line
   * distance and not the length of the entire route.
   */
  const tripDistanceMeters =
    hasTripSegment
      ? getTripDistanceMeters(
          stopDistances,
          boardingIndex,
          destinationIndex,
        )
      : null;

  // ==========================================================
  // FARE ESTIMATES
  // ==========================================================

  const fareOptionEstimates =
    hasTripSegment &&
    tripDistanceMeters !== null &&
    fareOption
      ? calculateFareOptionEstimates(
          [fareOption],
          tripDistanceMeters,
        )
      : [];

  const fareCards = buildFareCards(
    fareOptionEstimates,
    railFare,
    isRailRoute
      ? selectedRoute?.transport_variants.id ?? null
      : null,
  );

  // ==========================================================
  // TRIP STOP SELECTION
  // ==========================================================

  const handleTripStop = (index: number) => {
    const selection = selectTripStop(
      {
        boardingIndex,
        destinationIndex,
      },
      index,
    );

    setBoardingIndex(selection.boardingIndex);
    setDestinationIndex(selection.destinationIndex);
  };

  // ==========================================================
  // ROUTE LIST STOP SELECTION
  // ==========================================================

  /**
   * The route list has two responsibilities:
   *
   * 1. Update the boarding/destination selection.
   * 2. Update selectedPlace so the corresponding place details
   *    and photographs are displayed.
   *
   * This intentionally does not call handlePlaceSelect().
   * The route is already selected, and route-list selection
   * should not reload or change visible route layers.
   */
  const handleRouteListPick = (index: number) => {
    const routeStop = selectedRouteStops[index];

    if (!routeStop) {
      return;
    }

    const mapPoint = mapPoints.find(
      (point) =>
        point.kind === routeStop.kind &&
        point.ref_id === routeStop.ref_id,
    );

    if (mapPoint) {
      recordPhotoPointSelection(mapPoint, "route-list");
      setSelectedPlacePoint(mapPoint);
      setSelectionError(null);
    }

    // Preserve the existing route-list boarding and
    // destination selection behavior.
    handleTripStop(index);
  };

  // ==========================================================
  // CLEAR CURRENT TRIP
  // ==========================================================

  const clearTrip = () => {
    pendingBoardingPoint.current = null;
    pendingSavedJourney.current = null;

    setBoardingIndex(null);
    setDestinationIndex(null);
    setRouteLinesVisible(false);
  };

  // ==========================================================
  // CLEAR SELECTED ROUTE AND ALL ROUTE DRAWING
  // ==========================================================

  /**
   * Clear the selected route, every visible route line, and the
   * selected place details associated with the current map action.
   *
   * This also closes the place-details panel, including its Save
   * Stop / Save Terminal action and its photo-gallery collection.
   * Cached route geometry is retained for efficient future use.
   */
  const clearSelectedRoute = () => {
    pendingBoardingPoint.current = null;
    pendingSavedJourney.current = null;

    setBoardingIndex(null);
    setDestinationIndex(null);
    setVisibleRouteIds([]);
    setRouteLinesVisible(false);
    setSelectedRouteId("");

    clearPhotoSession();
    setSelectedPlacePoint(null);
  };

  // ==========================================================
  // SELECT MAP PLACE
  // ==========================================================

  const handlePlaceSelect = (point: RouteMapPoint) => {
    // A manual selection supersedes a pending saved journey.
    pendingSavedJourney.current = null;

    setSelectionError(null);
    recordPhotoPointSelection(point, "map");
    setSelectedPlacePoint(point);

    loadVisibleRouteLayers(
      point.routes.map(({ route }) => route.id),
    );

    setShowSearchResults(false);
    setSearchQuery("");
    setActiveSearchIndex(0);

    // --------------------------------------------------------
    // A ROUTE IS ALREADY LOADED
    // --------------------------------------------------------

    if (selectedRoute) {
      const routeStopIndex = findRouteStopIndex(
        selectedRouteStops,
        point,
      );

      if (routeStopIndex !== null) {
        if (
          isRepeatedBoardingPoint(
            {
              boardingIndex,
              destinationIndex,
            },
            routeStopIndex,
          )
        ) {
          clearTrip();
          return;
        }

        handleTripStop(routeStopIndex);
      }

      return;
    }

    // --------------------------------------------------------
    // ROUTE IS SELECTED BUT ITS DETAILS ARE NOT READY
    // --------------------------------------------------------

    if (selectedRouteId) {
      const activeRouteId = Number(selectedRouteId);

      if (
        point.routes.some(
          ({ route }) => route.id === activeRouteId,
        )
      ) {
        pendingBoardingPoint.current = {
          kind: point.kind,
          ref_id: point.ref_id,
        };

        /**
         * Restart the effect so it cannot miss a newly selected
         * boarding point during an existing route-loading request.
         */
        setSelectedRouteLoadVersion(
          (version) => version + 1,
        );
      }

      return;
    }

    // --------------------------------------------------------
    // AUTOMATICALLY SELECT A UNIQUE SERVING ROUTE
    // --------------------------------------------------------

    const uniqueRoute = getUniqueServingRoute(point);

    if (!uniqueRoute) {
      return;
    }

    pendingBoardingPoint.current = {
      kind: point.kind,
      ref_id: point.ref_id,
    };

    setSelectedRouteId(String(uniqueRoute.id));
  };

  // ==========================================================
  // COMMUNITY MAP LOCATION
  // ==========================================================

  const handleCommunityMapLocation = (
    latitude: number,
    longitude: number,
    label: string,
  ) => {
    setPinnedMapLocation({
      coordinates: [
        latitude,
        longitude,
      ],
      label,
    });
  };

  const clearPinnedMapLocation = () => {
    setPinnedMapLocation(null);
  };

  // ==========================================================
  // SELECT ROUTE LINE
  // ==========================================================

  const handleRouteLineSelect = (routeId: number) => {
    const nextRouteId = String(routeId);

    // Clicking the already-selected route toggles it off and
    // removes every displayed route line, not just its highlight.
    if (selectedRouteId === nextRouteId) {
      setSelectionError(null);
      clearSelectedRoute();
      return;
    }

    pendingSavedJourney.current = null;
    pendingBoardingPoint.current = null;

    setSelectionError(null);
    setRouteLinesVisible(true);
    setSelectedRouteId(nextRouteId);
  };

  // ==========================================================
  // APPLY SEARCH RESULT
  // ==========================================================

  const applySearchResultSelection = (
    result: RouteMapSearchResult,
    source: RecentSearchSelectionSource,
  ) => {
    pendingSavedJourney.current = null;

    if (source === "search") {
      recordRecentSearch(getRecentSearchItem(result));
    }

    setSelectionError(null);
    setSearchQuery("");
    setShowSearchResults(false);
    setActiveSearchIndex(0);

    if (result.kind === "route") {
      pendingBoardingPoint.current = null;

      clearPhotoSession();
      setSelectedPlacePoint(null);

      loadVisibleRouteLayers([
        result.route.id,
      ]);

      setBoardingIndex(null);
      setDestinationIndex(null);
      setSelectedRouteId(String(result.route.id));

      return;
    }

    handlePlaceSelect(result.point);
  };

  // ==========================================================
  // SEARCH RESULT SELECTION
  // ==========================================================

  const handleSearchResultSelect = (
    result: RouteMapSearchResult,
  ) => {
    applySearchResultSelection(result, "search");
  };

  // ==========================================================
  // SAVED ITEM SELECTION
  // ==========================================================

  const handleSavedItemSelect = (
    selection: ParsedSavedMapSelection,
  ): boolean => {
    const result = resolveSavedMapSelection(
      routeMapIndex,
      mapPoints,
      selection.kind,
      selection.targetId,
    );

    if (!result) {
      pendingSavedJourney.current = null;

      setSelectionError(
        "This item is no longer available on the map.",
      );

      return false;
    }

    // --------------------------------------------------------
    // JOURNEY BOOKMARK
    // --------------------------------------------------------

    if (selection.bookmarkType === "journey") {
      if (
        result.kind !== "route" ||
        !selection.journey
      ) {
        pendingSavedJourney.current = null;

        setSelectionError(
          "This saved journey contains invalid route information.",
        );

        return false;
      }

      const routeId = result.route.id;

      const {
        origin,
        destination,
      } = selection.journey;

      // ------------------------------------------------------
      // VALIDATE ENDPOINT MEMBERSHIP
      // ------------------------------------------------------

      const endpointBelongsToRoute = (
        endpoint: SavedJourneyEndpoint,
      ): boolean => {
        const point = mapPoints.find(
          (item) =>
            item.kind === endpoint.kind &&
            item.ref_id === endpoint.id,
        );

        return (
          point?.routes.some(
            ({ route }) => route.id === routeId,
          ) ?? false
        );
      };

      if (
        !endpointBelongsToRoute(origin) ||
        !endpointBelongsToRoute(destination)
      ) {
        pendingSavedJourney.current = null;

        setSelectionError(
          "One or both saved journey endpoints are no longer served by this route.",
        );

        return false;
      }

      // ------------------------------------------------------
      // PREPARE JOURNEY SELECTION
      // ------------------------------------------------------

      setSelectionError(null);
      setSearchQuery("");
      setShowSearchResults(false);
      setActiveSearchIndex(0);
      clearPhotoSession();
      setSelectedPlacePoint(null);

      pendingBoardingPoint.current = null;

      // A journey displays only its selected transit service.
      loadVisibleRouteLayers([
        routeId,
      ]);

      const originReference =
        toRoutePointReference(origin);

      const destinationReference =
        toRoutePointReference(destination);

      // ------------------------------------------------------
      // ROUTE DETAILS ARE ALREADY AVAILABLE
      // ------------------------------------------------------

      if (
        selectedRoute?.id === routeId &&
        !routeStopsLoading &&
        selectedRouteStops.length > 0
      ) {
        const originIndex = findRouteStopIndex(
          selectedRouteStops,
          originReference,
        );

        const destinationIndex = findRouteStopIndex(
          selectedRouteStops,
          destinationReference,
        );

        pendingSavedJourney.current = null;

        if (
          originIndex === null ||
          destinationIndex === null ||
          originIndex === destinationIndex
        ) {
          setBoardingIndex(null);
          setDestinationIndex(null);

          setSelectionError(
            "The saved journey's endpoints could not be matched to the selected route.",
          );

          return false;
        }

        setBoardingIndex(originIndex);
        setDestinationIndex(destinationIndex);

        return true;
      }

      // ------------------------------------------------------
      // ROUTE DETAILS NEED TO LOAD OR RELOAD
      // ------------------------------------------------------

      pendingSavedJourney.current = {
        routeId,
        origin,
        destination,
      };

      /**
       * Trigger a route-loading effect even when the same
       * route ID is already selected.
       *
       * This avoids missing the pending journey if an earlier
       * loading request completes at nearly the same time.
       */
      setSelectedRouteLoadVersion(
        (version) => version + 1,
      );

      const targetRouteId = String(routeId);

      if (selectedRouteId !== targetRouteId) {
        setSelectedRouteId(targetRouteId);
      }

      return true;
    }

    // --------------------------------------------------------
    // WHOLE ROUTE, STOP, OR TERMINAL
    // --------------------------------------------------------

    pendingSavedJourney.current = null;

    applySearchResultSelection(
      result,
      "restore",
    );

    return true;
  };

  // ==========================================================
  // KEYBOARD SEARCH
  // ==========================================================

  const handleSearchKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Escape") {
      setShowSearchResults(false);
      return;
    }

    if (
      !showSearchResults ||
      searchResults.length === 0
    ) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveSearchIndex((index) =>
        index >= searchResults.length - 1
          ? 0
          : index + 1,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveSearchIndex((index) =>
        index <= 0
          ? searchResults.length - 1
          : index - 1,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();

      handleSearchResultSelect(
        searchResults[activeSearchIndex],
      );
    }
  };

  // ==========================================================
  // MAP POINT ICONS
  // ==========================================================

  /**
   * Boarding and destination keep their existing role colors.
   *
   * Ordinary route stops retain the transport's configured color.
   */
  const pointIcon = (
    index: number,
    stop: RouteStop,
  ) => {
    const vehicleType = getMapVehicleType(
      selectedRoute?.transport_types.name ?? "",
    );

    if (index === boardingIndex) {
      return getEndpointMapIcon(
        "boarding",
        vehicleType,
      );
    }

    if (index === destinationIndex) {
      return getEndpointMapIcon(
        "destination",
        vehicleType,
      );
    }

    if (stop.kind === "terminal") {
      return getMapIcon("terminal");
    }

    return stop.stop_type === "train_station"
      ? getMapIcon("train_station", routeColor)
      : getMapIcon("stop", routeColor);
  };

  // ==========================================================
  // RETURN MAP CONTROLLER
  // ==========================================================

  return {
    // --------------------------------------------------------
    // LOCATION
    // --------------------------------------------------------

    currentPosition,
    locationStatus,
    locationError,
    showLocationPopup,
    requestCurrentLocation,

    // --------------------------------------------------------
    // LOADING / ERRORS
    // --------------------------------------------------------

    stopsLoading,
    stopError,
    terminalsLoading,
    terminalError,
    routesLoading,
    routeMapError,
    routeError,
    selectionError,
    routeStopsLoading,
    roadRouteLoading,
    routeMapIndex,

    // --------------------------------------------------------
    // MAP DATA
    // --------------------------------------------------------

    mapPoints,
    selectedPlace,
    selectedPlaceImages,
    selectedPlaceImage,
    pointImages,
    photoSelectionEvent,
    pinnedMapLocation,
    displayedRouteLayers,
    displayedRoutePositions,
    coincidentRouteIdsByGeometry,
    stopMapPositions,

    // --------------------------------------------------------
    // ROUTE SELECTION
    // --------------------------------------------------------

    selectedRouteId,
    selectedRoute,
    selectedRouteStops,

    // --------------------------------------------------------
    // TRIP SELECTION
    // --------------------------------------------------------

    boardingIndex,
    destinationIndex,
    boardingStop,
    destinationStop,
    hasTripSegment,
    isJourneyViewActive,

    // --------------------------------------------------------
    // ROUTE GEOMETRY
    // --------------------------------------------------------

    routeColor,
    isRailRoute,
    routeDistanceMeters,
    routeDurationSeconds,
    journeyGeometry,
    journeyGeometryError,
    tripDurationSeconds,

    // --------------------------------------------------------
    // JOURNEY DISTANCE
    // --------------------------------------------------------

    tripDistanceMeters,

    // --------------------------------------------------------
    // FARES
    // --------------------------------------------------------

    fareOption,
    fareOptionLoading,
    fareOptionError,
    railFareLoading,
    railFareError,
    fareCards,

    // --------------------------------------------------------
    // ROUTE ENDPOINT NAMES
    // --------------------------------------------------------

    originName,
    destinationName,

    // --------------------------------------------------------
    // SEARCH
    // --------------------------------------------------------

    searchQuery,
    setSearchQuery,
    searchResults,
    showSearchResults,
    setShowSearchResults,
    activeSearchIndex,
    setActiveSearchIndex,

    // --------------------------------------------------------
    // ACTIONS
    // --------------------------------------------------------

    pointIcon,
    handlePlaceSelect,
    handleRouteListPick,
    handleCommunityMapLocation,
    clearPinnedMapLocation,
    handleRouteLineSelect,
    handleSearchResultSelect,
    handleSavedItemSelect,
    handleSearchKeyDown,
    handleListPick: handleTripStop,
    clearTrip,
    clearSelectedRoute,

    closePlace: () => {
      clearPhotoSession();
      setSelectedPlacePoint(null);
    },
  };
}

// ============================================================
// CONTROLLER TYPE
// ============================================================

export type TransitMapController =
  ReturnType<typeof useTransitMap>;
