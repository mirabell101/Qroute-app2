import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";

import { supabase } from "@/lib/supabase";
import { subscribeToMapSync } from "@/lib/mapSync";

// ============================================================
// DATA SERVICES
// ============================================================

import { getTerminals, invalidateTerminalsCache } from "@/lib/terminals";
import type { Terminal } from "@/lib/terminals";

import { getStops, invalidateStopsCache } from "@/lib/stops";
import type { Stop } from "@/lib/stops";

import {
  getRouteDetails,
  getRouteMapIndex,
  invalidateRouteMapIndexCache,
} from "@/lib/routes";

import { invalidatePublicMapDataCache } from "@/lib/publicMap";

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
  isEligibleMapPoint,
  isEligibleMapRoute,
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

export type Coordinates = [number, number];

export interface PinnedMapLocation {
  coordinates: Coordinates;
  label: string;
}

export interface MapTransportType {
  id: number;
  name: string;
  color: string;
}

interface PointTransportMetadata {
  id: number;
  transport_type_id?: number | null;
  transport_types?: {
    name: string;
    color: string;
  } | null;
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

/**
 * `null` means route associations are unrestricted (the full map).
 * An empty array means the active selection is independent of any route.
 * A non-empty array contains the exact eligible route IDs in the current
 * selection scope. The canvas uses this to avoid showing icons for routes
 * outside the active map scope at a shared stop or terminal.
 */
export type DisplayedAssociationRouteIds = number[] | null;

// ============================================================
// CONSTANTS
// ============================================================

export const defaultPosition: Coordinates = [14.7167, 121.05];

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
 * Saved journey endpoints use { kind, id }, while RouteMapPoint and
 * findRouteStopIndex use { kind, ref_id }.
 */
function toRoutePointReference(
  endpoint: SavedJourneyEndpoint,
): Pick<RouteMapPoint, "kind" | "ref_id"> {
  return {
    kind: endpoint.kind,
    ref_id: endpoint.id,
  };
}

function normalizedPointName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function distanceBetweenPointsMeters(
  left: Pick<RouteMapPoint, "latitude" | "longitude">,
  right: Pick<RouteMapPoint, "latitude" | "longitude">,
): number {
  const latitudeMeters = (left.latitude - right.latitude) * 111_320;
  const longitudeMeters =
    (left.longitude - right.longitude) *
    111_320 *
    Math.cos((left.latitude * Math.PI) / 180);

  return Math.hypot(latitudeMeters, longitudeMeters);
}

/**
 * Keeps a selected place attached to its replacement after a stop/terminal
 * conversion. This is only a conversion-restoration fallback; all map
 * visibility and route-association filtering below uses exact IDs and kinds.
 */
function findRefreshedMapPoint(
  previous: Pick<
    RouteMapPoint,
    "kind" | "ref_id" | "name" | "latitude" | "longitude"
  >,
  nextPoints: RouteMapPoint[],
  preferredRouteId?: number,
): RouteMapPoint | null {
  const exact = nextPoints.find(
    (point) =>
      point.kind === previous.kind &&
      point.ref_id === previous.ref_id,
  );

  // A converted shared location may remain active because another route
  // still uses it. When a route is selected, prefer the replacement point
  // associated with that route rather than a still-valid old point.
  if (
    exact &&
    preferredRouteId !== undefined &&
    exact.routes.some(({ route }) => route.id === preferredRouteId)
  ) {
    return exact;
  }

  const previousName = normalizedPointName(previous.name);
  const nearby = nextPoints
    .filter((point) => normalizedPointName(point.name) === previousName)
    .map((point) => ({
      point,
      distance: distanceBetweenPointsMeters(previous, point),
    }))
    .filter((candidate) => candidate.distance <= 25)
    .sort((left, right) => left.distance - right.distance);

  if (preferredRouteId !== undefined) {
    const replacementsOnRoute = nearby.filter(
      ({ point }) =>
        (point.kind !== previous.kind || point.ref_id !== previous.ref_id) &&
        point.routes.some(({ route }) => route.id === preferredRouteId),
    );

    if (replacementsOnRoute.length === 1) {
      return replacementsOnRoute[0].point;
    }

    if (
      replacementsOnRoute.length > 1 &&
      replacementsOnRoute[1].distance - replacementsOnRoute[0].distance >= 5
    ) {
      return replacementsOnRoute[0].point;
    }
  }

  if (exact) return exact;
  if (nearby.length === 1) return nearby[0].point;

  if (
    nearby.length > 1 &&
    nearby[1].distance - nearby[0].distance >= 5
  ) {
    return nearby[0].point;
  }

  return null;
}

function isValidRouteId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

// ============================================================
// MAIN HOOK
// ============================================================

export function useTransitMap(
  currentUserId: string | null | undefined = undefined,
) {
  const { record: recordRecentSearch } = useRecentSearches();

  // ==========================================================
  // CURRENT LOCATION
  // ==========================================================

  const geolocation =
    typeof navigator === "undefined" ? null : navigator.geolocation;

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
  const [showLocationPopup, setShowLocationPopup] = useState(false);

  const locationRequestInFlight = useRef(false);
  const locationPopupTimer = useRef<number | null>(null);

  // ==========================================================
  // INDEPENDENT MAP LOCATION DATA
  // ==========================================================

  const [stops, setStops] = useState<Stop[]>([]);
  const [stopError, setStopError] = useState<string | null>(null);
  const [stopsLoading, setStopsLoading] = useState(true);

  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalsLoading, setTerminalsLoading] = useState(true);

  // ==========================================================
  // ROUTE MAP DATA
  // ==========================================================

  const [routeMapIndex, setRouteMapIndex] = useState<RouteMapIndex>({
    routes: [],
    points: [],
  });

  const [routesLoading, setRoutesLoading] = useState(true);
  const [routeMapError, setRouteMapError] = useState<string | null>(null);
  const [mapSyncStatus, setMapSyncStatus] =
    useState<"connecting" | "connected" | "disconnected">("connecting");

  // ==========================================================
  // VEHICLE FILTER
  // ==========================================================

  const [transportTypes, setTransportTypes] = useState<MapTransportType[]>([]);
  const [transportTypesLoading, setTransportTypesLoading] = useState(true);
  const [activeTransportTypeId, setActiveTransportTypeId] =
    useState<number | null>(null);

  // ==========================================================
  // SELECTED ROUTE
  // ==========================================================

  const [selectedRouteId, setSelectedRouteId] = useState("");

  /** Explicitly restarts selected-route loading for saved journey restoration. */
  const [selectedRouteLoadVersion, setSelectedRouteLoadVersion] = useState(0);

  const [selectedRoute, setSelectedRoute] = useState<RouteDetails | null>(null);
  const [selectedRouteStops, setSelectedRouteStops] = useState<RouteStop[]>([]);
  const [routeStopsLoading, setRouteStopsLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Keep trip indexes near route selection so the map's selection scope can
  // be derived before the canvas receives its filtered marker collection.
  const [boardingIndex, setBoardingIndex] = useState<number | null>(null);
  const [destinationIndex, setDestinationIndex] = useState<number | null>(null);

  // ==========================================================
  // ROUTE LAYERS
  // ==========================================================

  const [routeLayers, setRouteLayers] =
    useState<Record<number, RouteLayerState>>({});
  const [visibleRouteIds, setVisibleRouteIds] = useState<number[]>([]);
  const [routeLinesVisible, setRouteLinesVisible] = useState(true);

  // A route-line click narrows the map to one of the selected place's
  // actual serving routes. Clearing that focus restores the unfiltered map.
  const [routeLineFocusActive, setRouteLineFocusActive] = useState(false);

  // ==========================================================
  // PLACE AND MAP SELECTION
  // ==========================================================

  const [selectedPlacePoint, setSelectedPlacePoint] =
    useState<RouteMapPoint | null>(null);
  const [pinnedMapLocation, setPinnedMapLocation] =
    useState<PinnedMapLocation | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // ==========================================================
  // SEARCH
  // ==========================================================

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);

  // ==========================================================
  // PENDING SELECTIONS
  // ==========================================================

  const pendingBoardingPoint = useRef<
    Pick<RouteMapPoint, "kind" | "ref_id"> | null
  >(null);

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
   * Merge route-associated and independently loaded locations. The data
   * layer already validates them, and this controller repeats the strict
   * status check as a final boundary before any selection can use a point.
   */
  const mapPoints = useMemo(() => {
    const stopTransportTypeIds = new Map(
      (stops as unknown as PointTransportMetadata[]).map((stop) => [
        stop.id,
        stop.transport_type_id ?? null,
      ]),
    );

    const terminalTransportTypeIds = new Map(
      (terminals as unknown as PointTransportMetadata[]).map((terminal) => [
        terminal.id,
        terminal.transport_type_id ?? null,
      ]),
    );

    return mergeMapLocations(routeMapIndex, stops, terminals)
      .filter(isEligibleMapPoint)
      .map((point) => ({
        ...point,
        routes: point.routes.filter(({ route }) => isEligibleMapRoute(route)),
        transport_type_id:
          point.kind === "stop"
            ? stopTransportTypeIds.get(point.ref_id) ?? null
            : terminalTransportTypeIds.get(point.ref_id) ?? null,
      }));
  }, [routeMapIndex, stops, terminals]);

  const selectedPlace = useMemo(
    () =>
      selectedPlacePoint
        ? mapPoints.find(
            (point) =>
              point.kind === selectedPlacePoint.kind &&
              point.ref_id === selectedPlacePoint.ref_id &&
              isEligibleMapPoint(point),
          ) ?? null
        : null,
    [mapPoints, selectedPlacePoint],
  );

  /**
   * A complete passenger journey has precedence over an ordinary place or
   * route focus. The pending saved-journey case is included so the route's
   * points are scoped correctly while its route details are being restored.
   */
  const currentSelectedRouteNumber = Number(selectedRouteId);
  const isPassengerJourneyMapScopeActive =
    (
      pendingSavedJourney.current !== null &&
      pendingSavedJourney.current.routeId === currentSelectedRouteNumber
    ) ||
    (
      selectedRoute !== null &&
      selectedRoute.id === currentSelectedRouteNumber &&
      boardingIndex !== null &&
      destinationIndex !== null &&
      boardingIndex !== destinationIndex &&
      selectedRouteStops[boardingIndex]?.route_id === selectedRoute.id &&
      selectedRouteStops[destinationIndex]?.route_id === selectedRoute.id
    );

  /**
   * Route IDs that define the current point/route focus.
   *
   * - null: no active selection; do not restrict associations.
   * - []: an independent selected location with no serving route.
   * - [ids]: exact serving route IDs for the current focus.
   *
   * A passenger journey and an explicit route-line focus take precedence
   * over the broader multi-route scope of a selected place.
   */
  const displayedAssociationRouteIds = useMemo<DisplayedAssociationRouteIds>(() => {
    const eligibleRouteIds = new Set(
      routeMapIndex.routes
        .filter(isEligibleMapRoute)
        .map((route) => route.id),
    );

    if (
      isPassengerJourneyMapScopeActive ||
      routeLineFocusActive ||
      (!selectedPlace && Boolean(selectedRouteId))
    ) {
      const focusedRouteId = Number(selectedRouteId);
      return isValidRouteId(focusedRouteId) && eligibleRouteIds.has(focusedRouteId)
        ? [focusedRouteId]
        : [];
    }

    if (selectedPlace) {
      return [
        ...new Set(
          selectedPlace.routes
            .filter(({ route }) =>
              isEligibleMapRoute(route) &&
              eligibleRouteIds.has(route.id) &&
              (
                activeTransportTypeId === null ||
                route.transport_type_id === activeTransportTypeId
              ),
            )
            .map(({ route }) => route.id),
        ),
      ];
    }

    return null;
  }, [
    routeMapIndex.routes,
    isPassengerJourneyMapScopeActive,
    routeLineFocusActive,
    selectedRouteId,
    selectedPlace,
    activeTransportTypeId,
  ]);

  const displayedMapPoints = useMemo(() => {
    const vehicleFilteredPoints = activeTransportTypeId === null
      ? mapPoints
      : mapPoints.filter((point) => {
          const associatedTypeIds = new Set(
            point.routes.map(({ route }) => route.transport_type_id),
          );

          if (associatedTypeIds.size > 0) {
            return associatedTypeIds.has(activeTransportTypeId);
          }

          return point.transport_type_id === activeTransportTypeId;
        });

    // No selection: retain the complete eligible map-point collection.
    if (displayedAssociationRouteIds === null) {
      return vehicleFilteredPoints;
    }

    const selectedRouteIds = new Set(displayedAssociationRouteIds);

    // A journey, explicit route-line focus, or route-only selection shows
    // locations associated with that exact route ID.
    if (
      isPassengerJourneyMapScopeActive ||
      routeLineFocusActive ||
      (!selectedPlace && Boolean(selectedRouteId))
    ) {
      return vehicleFilteredPoints.filter((point) =>
        point.routes.some(({ route }) => selectedRouteIds.has(route.id)),
      );
    }

    // A selected place with no serving routes is an independent location.
    if (selectedRouteIds.size === 0) {
      return vehicleFilteredPoints.filter(
        (point) =>
          point.kind === selectedPlace?.kind &&
          point.ref_id === selectedPlace?.ref_id,
      );
    }

    // A selected stop/terminal displays itself and the union of the actual
    // locations served by every eligible route associated with that point.
    return vehicleFilteredPoints.filter(
      (point) =>
        (
          point.kind === selectedPlace?.kind &&
          point.ref_id === selectedPlace?.ref_id
        ) ||
        point.routes.some(({ route }) => selectedRouteIds.has(route.id)),
    );
  }, [
    mapPoints,
    activeTransportTypeId,
    displayedAssociationRouteIds,
    isPassengerJourneyMapScopeActive,
    routeLineFocusActive,
    selectedPlace,
    selectedRouteId,
  ]);

  const displayedRoutesForSearch = useMemo(
    () =>
      activeTransportTypeId === null
        ? routeMapIndex.routes.filter(isEligibleMapRoute)
        : routeMapIndex.routes.filter(
            (route) =>
              isEligibleMapRoute(route) &&
              route.transport_type_id === activeTransportTypeId,
          ),
    [routeMapIndex.routes, activeTransportTypeId],
  );

  const searchResults = useMemo(
    () =>
      searchRouteMapItems(
        displayedRoutesForSearch,
        displayedMapPoints,
        searchQuery,
      ),
    [displayedRoutesForSearch, displayedMapPoints, searchQuery],
  );

  // ==========================================================
  // SELECTED ROUTE GEOMETRY
  // ==========================================================

  const selectedRouteLayer = selectedRouteId
    ? routeLayers[Number(selectedRouteId)]
    : undefined;

  const selectedRouteGeometry = selectedRouteLayer?.geometry;
  const routeDistanceMeters = selectedRouteGeometry?.totalDistanceMeters ?? null;
  const routeDurationSeconds = selectedRouteGeometry?.durationSeconds ?? null;
  const stopDistances = selectedRouteGeometry?.stopDistances ?? [];
  const stopMapPositions = selectedRouteGeometry?.stopMapPositions ?? [];
  const roadRouteLoading = selectedRouteLayer?.status === "loading";

  // ==========================================================
  // DISPLAYED ROUTE LAYERS
  // ==========================================================

  const displayedRouteIds = useMemo(() => {
    if (!routeLinesVisible) return [];

    const eligibleRouteIds = new Set(
      routeMapIndex.routes
        .filter(isEligibleMapRoute)
        .map((route) => route.id),
    );

    if (displayedAssociationRouteIds !== null) {
      return displayedAssociationRouteIds.filter((routeId) =>
        eligibleRouteIds.has(routeId),
      );
    }

    return getDisplayedRouteIds(
      visibleRouteIds,
      "",
      routeLinesVisible,
    ).filter((routeId) => eligibleRouteIds.has(routeId));
  }, [
    routeLinesVisible,
    routeMapIndex.routes,
    displayedAssociationRouteIds,
    visibleRouteIds,
  ]);

  const displayedRouteLayers = useMemo(
    () =>
      displayedRouteIds.flatMap((routeId) => {
        const layer = routeLayers[routeId];
        const indexedRoute = routeMapIndex.routes.find(
          (route) => route.id === routeId,
        );

        if (
          !indexedRoute ||
          !isEligibleMapRoute(indexedRoute) ||
          !layer?.route ||
          !isEligibleMapRoute(layer.route) ||
          !layer.geometry ||
          layer.route.id !== routeId ||
          (
            activeTransportTypeId !== null &&
            layer.route.transport_type_id !== activeTransportTypeId
          )
        ) {
          return [];
        }

        // Do not draw a stale geometry if any route stop is no longer present
        // as an eligible, exactly associated map point.
        const everyRoutePointEligible = layer.route.route_stops.every(
          (routeStop) =>
            mapPoints.some(
              (point) =>
                point.kind === routeStop.kind &&
                point.ref_id === routeStop.ref_id &&
                isEligibleMapPoint(point) &&
                point.routes.some(
                  ({ route }) =>
                    route.id === routeId && isEligibleMapRoute(route),
                ),
            ),
        );

        if (
          layer.route.route_stops.length === 0 ||
          !everyRoutePointEligible
        ) {
          return [];
        }

        return [{ routeId, route: layer.route, geometry: layer.geometry }];
      }),
    [
      displayedRouteIds,
      routeLayers,
      routeMapIndex.routes,
      mapPoints,
      activeTransportTypeId,
    ],
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
    [displayedRouteLayers],
  );

  // ==========================================================
  // MAP REFRESH SNAPSHOT
  // ==========================================================

  const mapRefreshSnapshotRef = useRef({
    selectedRouteId,
    selectedRouteStops,
    visibleRouteIds,
    selectedPlacePoint,
    boardingIndex,
    destinationIndex,
  });

  mapRefreshSnapshotRef.current = {
    selectedRouteId,
    selectedRouteStops,
    visibleRouteIds,
    selectedPlacePoint,
    boardingIndex,
    destinationIndex,
  };

  // ==========================================================
  // FARE CONFIGURATION
  // ==========================================================

  const [fareOption, setFareOption] = useState<TransportFareOption | null>(null);
  const [fareOptionLoading, setFareOptionLoading] = useState(false);
  const [fareOptionError, setFareOptionError] = useState<string | null>(null);
  const [railFare, setRailFare] = useState<RailFare | null>(null);
  const [railFareLoading, setRailFareLoading] = useState(false);
  const [railFareError, setRailFareError] = useState<string | null>(null);

  // ==========================================================
  // POINT IMAGES
  // ==========================================================

  /**
   * Images are cached by point identity for the current place-details
   * session. Multiple selections can coexist in the panel gallery.
   */
  const [pointImages, setPointImages] =
    useState<Record<string, PointImage[]>>({});
  const [photoSelectionEvent, setPhotoSelectionEvent] =
    useState<PhotoPointSelectionEvent | null>(null);

  const photoSelectionSequence = useRef(0);
  const pointImageRequestGeneration = useRef(0);
  const requestedPointImageKeys = useRef(new Set<string>());

  const clearPhotoSession = useCallback(() => {
    pointImageRequestGeneration.current += 1;
    requestedPointImageKeys.current.clear();
    setPointImages({});
    setPhotoSelectionEvent(null);
  }, []);

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
    if (requestedPointImageKeys.current.has(pointKey)) return;

    requestedPointImageKeys.current.add(pointKey);
    const requestGeneration = pointImageRequestGeneration.current;
    const terminalIds = point.kind === "terminal" ? [point.ref_id] : [];
    const stopIds = point.kind === "stop" ? [point.ref_id] : [];

    void getPointImages(terminalIds, stopIds)
      .then((images) => {
        if (requestGeneration !== pointImageRequestGeneration.current) return;

        setPointImages((current) => ({
          ...current,
          ...images,
        }));
      })
      .catch(() => {
        if (requestGeneration === pointImageRequestGeneration.current) {
          requestedPointImageKeys.current.delete(pointKey);
        }
      });
  };

  const refreshPointImageSession = useCallback(async (
    replacement?: { previous: RouteMapPoint; next: RouteMapPoint },
  ) => {
    const previousKey = replacement
      ? `${replacement.previous.kind}-${replacement.previous.ref_id}`
      : null;
    const nextKey = replacement
      ? `${replacement.next.kind}-${replacement.next.ref_id}`
      : null;

    const galleryKeys = [...requestedPointImageKeys.current].map((key) =>
      key === previousKey && nextKey ? nextKey : key,
    );

    if (nextKey && !galleryKeys.includes(nextKey)) galleryKeys.push(nextKey);
    requestedPointImageKeys.current = new Set(galleryKeys);

    if (
      replacement &&
      previousKey &&
      nextKey &&
      (
        replacement.previous.kind !== replacement.next.kind ||
        replacement.previous.ref_id !== replacement.next.ref_id
      )
    ) {
      photoSelectionSequence.current += 1;
      setPhotoSelectionEvent((current) =>
        current &&
        current.place.kind === replacement.previous.kind &&
        current.place.ref_id === replacement.previous.ref_id
          ? {
              ...current,
              sequence: photoSelectionSequence.current,
              place: {
                kind: replacement.next.kind,
                ref_id: replacement.next.ref_id,
                name: replacement.next.name,
              },
            }
          : current,
      );
    }

    if (galleryKeys.length === 0) return;

    const terminalIds: number[] = [];
    const stopIds: number[] = [];

    for (const key of galleryKeys) {
      const separator = key.indexOf("-");
      if (separator < 0) continue;

      const kind = key.slice(0, separator);
      const id = Number(key.slice(separator + 1));
      if (!isValidRouteId(id)) continue;

      if (kind === "terminal") terminalIds.push(id);
      if (kind === "stop") stopIds.push(id);
    }

    const requestGeneration = ++pointImageRequestGeneration.current;

    setPointImages((current) => {
      const next = { ...current };
      galleryKeys.forEach((key) => delete next[key]);
      return next;
    });

    try {
      const images = await getPointImages(terminalIds, stopIds);
      if (requestGeneration !== pointImageRequestGeneration.current) return;

      setPointImages((current) => ({
        ...current,
        ...images,
      }));
    } catch {
      // Place photos are optional and cannot block map synchronization.
    }
  }, []);

  // ==========================================================
  // CURRENT LOCATION REQUEST
  // ==========================================================

  const requestCurrentLocation = useCallback(async () => {
    if (locationRequestInFlight.current) return;

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
  // LOAD ROUTE LAYER
  // ==========================================================

  const loadRouteLayer = useCallback(
    (routeId: number): Promise<LoadedRouteLayer> => {
      const cached = routeLayerCache.current.get(routeId);
      if (cached) return cached;

      setRouteLayers((current) => ({
        ...current,
        [routeId]: {
          ...current[routeId],
          status: "loading",
          error: undefined,
        },
      }));

      let request!: Promise<LoadedRouteLayer>;
      request = (async (): Promise<LoadedRouteLayer> => {
        const route = await getRouteDetails(routeId, currentUserId);

        // A map refresh can invalidate a request while it is in flight.
        if (routeLayerCache.current.get(routeId) !== request) {
          return { route, geometry: null };
        }

        if (!isEligibleMapRoute(route)) {
          throw new Error("This route isn't available on the map.");
        }

        setRouteLayers((current) => ({
          ...current,
          [routeId]: {
            status: "loading",
            route,
          },
        }));

        try {
          const geometry = await getRouteGeometry(route);

          if (routeLayerCache.current.get(routeId) !== request) {
            return { route, geometry: null };
          }

          setRouteLayers((current) => ({
            ...current,
            [routeId]: {
              status: "ready",
              route,
              geometry,
            },
          }));

          return { route, geometry };
        } catch (error: unknown) {
          if (routeLayerCache.current.get(routeId) !== request) {
            return { route, geometry: null };
          }

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
        if (routeLayerCache.current.get(routeId) !== request) return;

        routeLayerCache.current.delete(routeId);
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
      const eligibleRouteIds = new Set(
        routeMapIndex.routes
          .filter(isEligibleMapRoute)
          .map((route) => route.id),
      );
      const uniqueIds = [...new Set(routeIds)].filter((routeId) =>
        eligibleRouteIds.has(routeId),
      );

      setVisibleRouteIds(uniqueIds);
      setRouteLinesVisible(uniqueIds.length > 0);

      uniqueIds.forEach((routeId) => {
        void loadRouteLayer(routeId).catch(() => undefined);
      });
    },
    [loadRouteLayer, routeMapIndex.routes],
  );

  // ==========================================================
  // LIVE MAP DATA REFRESH
  // ==========================================================

  const mapRefreshInFlight = useRef(false);
  const mapRefreshQueued = useRef(false);

  const refreshMapData = useCallback(async () => {
    if (mapRefreshInFlight.current) {
      mapRefreshQueued.current = true;
      return;
    }

    mapRefreshInFlight.current = true;
    setStopsLoading(true);
    setTerminalsLoading(true);
    setRoutesLoading(true);

    try {
      // The data-service caches are useful between unrelated reads, but a
      // map-sync event must not reuse a pre-archive/pre-conversion response.
      // Invalidate all four shared caches before loading the same snapshot.
      invalidateStopsCache();
      invalidateTerminalsCache();
      invalidateRouteMapIndexCache();
      invalidatePublicMapDataCache();

      const [nextStops, nextTerminals, nextRouteMapIndex] = await Promise.all([
        getStops(currentUserId),
        getTerminals(currentUserId),
        getRouteMapIndex(currentUserId),
      ]);

      const snapshot = mapRefreshSnapshotRef.current;
      const nextMapPoints = mergeMapLocations(
        nextRouteMapIndex,
        nextStops,
        nextTerminals,
      ).filter(isEligibleMapPoint);

      const selectedRouteNumber = Number(snapshot.selectedRouteId);
      const hasSelectedRouteNumber =
        isValidRouteId(selectedRouteNumber) && Boolean(snapshot.selectedRouteId);
      const nextEligibleRouteIds = new Set(
        nextRouteMapIndex.routes
          .filter(isEligibleMapRoute)
          .map((route) => route.id),
      );
      const selectedRouteStillEligible =
        !hasSelectedRouteNumber || nextEligibleRouteIds.has(selectedRouteNumber);

      // Preserve passenger journey endpoints by exact location identity.
      // Conversion restoration keeps its existing same-name/near-coordinate
      // fallback, but map association filtering never uses either attribute.
      if (hasSelectedRouteNumber && selectedRouteStillEligible) {
        const pendingJourney = pendingSavedJourney.current;
        if (!pendingJourney || pendingJourney.routeId !== selectedRouteNumber) {
          const boardingPoint =
            snapshot.boardingIndex === null
              ? null
              : snapshot.selectedRouteStops[snapshot.boardingIndex] ?? null;
          const destinationPoint =
            snapshot.destinationIndex === null
              ? null
              : snapshot.selectedRouteStops[snapshot.destinationIndex] ?? null;

          if (boardingPoint && destinationPoint) {
            const refreshedBoardingPoint = findRefreshedMapPoint(
              {
                kind: boardingPoint.kind,
                ref_id: boardingPoint.ref_id,
                name: boardingPoint.name,
                latitude: boardingPoint.latitude,
                longitude: boardingPoint.longitude,
              },
              nextMapPoints,
              selectedRouteNumber,
            );
            const refreshedDestinationPoint = findRefreshedMapPoint(
              {
                kind: destinationPoint.kind,
                ref_id: destinationPoint.ref_id,
                name: destinationPoint.name,
                latitude: destinationPoint.latitude,
                longitude: destinationPoint.longitude,
              },
              nextMapPoints,
              selectedRouteNumber,
            );

            pendingSavedJourney.current = {
              routeId: selectedRouteNumber,
              origin: {
                kind: refreshedBoardingPoint?.kind ?? boardingPoint.kind,
                id: refreshedBoardingPoint?.ref_id ?? boardingPoint.ref_id,
              },
              destination: {
                kind: refreshedDestinationPoint?.kind ?? destinationPoint.kind,
                id: refreshedDestinationPoint?.ref_id ?? destinationPoint.ref_id,
              },
            };
            pendingBoardingPoint.current = null;
          } else if (boardingPoint || destinationPoint) {
            const point = boardingPoint ?? destinationPoint;
            const refreshedPoint = findRefreshedMapPoint(
              {
                kind: point!.kind,
                ref_id: point!.ref_id,
                name: point!.name,
                latitude: point!.latitude,
                longitude: point!.longitude,
              },
              nextMapPoints,
              selectedRouteNumber,
            );
            pendingBoardingPoint.current = {
              kind: refreshedPoint?.kind ?? point!.kind,
              ref_id: refreshedPoint?.ref_id ?? point!.ref_id,
            };
            pendingSavedJourney.current = null;
          } else if (
            pendingJourney &&
            pendingJourney.routeId !== selectedRouteNumber
          ) {
            pendingSavedJourney.current = null;
            pendingBoardingPoint.current = null;
          }
        }
      }

      setStops(nextStops);
      setTerminals(nextTerminals);
      setRouteMapIndex(nextRouteMapIndex);
      setStopError(null);
      setTerminalError(null);
      setRouteMapError(null);

      // If the selected route became inactive, deleted, or otherwise
      // disappeared from the eligible route index, release the stale route
      // focus so the remaining eligible map points become visible again.
      if (hasSelectedRouteNumber && !selectedRouteStillEligible) {
        pendingBoardingPoint.current = null;
        pendingSavedJourney.current = null;
        setRouteLineFocusActive(false);
        setSelectedRouteId("");
        setBoardingIndex(null);
        setDestinationIndex(null);
        const survivingVisibleRouteIds = snapshot.visibleRouteIds.filter((routeId) =>
          nextEligibleRouteIds.has(routeId),
        );
        setVisibleRouteIds(survivingVisibleRouteIds);
        setRouteLinesVisible(survivingVisibleRouteIds.length > 0);
      }

      // Rebind selected details to the replacement point after conversion.
      // If no eligible point remains, close the stale details and gallery.
      if (snapshot.selectedPlacePoint) {
        const refreshedPlace = findRefreshedMapPoint(
          snapshot.selectedPlacePoint,
          nextMapPoints,
          hasSelectedRouteNumber && selectedRouteStillEligible
            ? selectedRouteNumber
            : undefined,
        );

        if (refreshedPlace) {
          setSelectedPlacePoint(refreshedPlace);
          const changedIdentity =
            refreshedPlace.kind !== snapshot.selectedPlacePoint.kind ||
            refreshedPlace.ref_id !== snapshot.selectedPlacePoint.ref_id;

          void refreshPointImageSession(
            changedIdentity
              ? { previous: snapshot.selectedPlacePoint, next: refreshedPlace }
              : undefined,
          );
        } else {
          setSelectedPlacePoint(null);
          clearPhotoSession();
        }
      } else {
        void refreshPointImageSession();
      }

      // Invalidate cached route layers that were visible or selected. Also
      // evict any cached layer whose route is no longer eligible.
      const routeIdsToReload = new Set<number>([
        ...snapshot.visibleRouteIds.filter((routeId) =>
          nextEligibleRouteIds.has(routeId),
        ),
        ...(hasSelectedRouteNumber && selectedRouteStillEligible
          ? [selectedRouteNumber]
          : []),
      ]);

      for (const cachedRouteId of routeLayerCache.current.keys()) {
        if (!nextEligibleRouteIds.has(cachedRouteId)) {
          routeLayerCache.current.delete(cachedRouteId);
        }
      }

      setRouteLayers((current) => {
        const next = { ...current };
        routeIdsToReload.forEach((routeId) => delete next[routeId]);
        for (const routeId of Object.keys(next).map(Number)) {
          if (!nextEligibleRouteIds.has(routeId)) delete next[routeId];
        }
        return next;
      });

      // The selected route is reloaded by the selected-route effect so its
      // boarding and destination references can be restored. Other visible
      // layers can be reloaded directly.
      routeIdsToReload.forEach((routeId) => {
        if (routeId !== selectedRouteNumber) {
          void loadRouteLayer(routeId).catch(() => undefined);
        }
      });

      if (hasSelectedRouteNumber && selectedRouteStillEligible) {
        setSelectedRouteLoadVersion((version) => version + 1);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to synchronize the transit map.";
      setRouteMapError(message);
      console.error("QRoute live map refresh failed:", error);
    } finally {
      setStopsLoading(false);
      setTerminalsLoading(false);
      setRoutesLoading(false);
      mapRefreshInFlight.current = false;

      if (mapRefreshQueued.current) {
        mapRefreshQueued.current = false;
        window.setTimeout(() => {
          void refreshMapData();
        }, 250);
      }
    }
  }, [
    currentUserId,
    loadRouteLayer,
    refreshPointImageSession,
    clearPhotoSession,
  ]);

  // Initial load and all later refreshes share the same data path.
  useEffect(() => {
    void refreshMapData();
  }, [refreshMapData]);

  // ==========================================================
  // VEHICLE FILTER OPTIONS
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadTransportTypes() {
      setTransportTypesLoading(true);

      try {
        const { data, error } = await supabase
          .from("transport_types")
          .select("id, name, color")
          .order("name", { ascending: true });

        if (error) throw error;

        if (active) {
          setTransportTypes(
            (data ?? []).map((type: { id: number; name: string; color: string }) => ({
              id: type.id,
              name: type.name,
              color: type.color,
            })),
          );
        }
      } catch (error: unknown) {
        console.error("Unable to load vehicle filter options:", error);

        if (active) {
          const fallback = new Map<number, MapTransportType>();

          routeMapIndex.routes.forEach((route) => {
            if (!isEligibleMapRoute(route)) return;
            fallback.set(route.transport_type_id, {
              id: route.transport_type_id,
              name: route.transport_types.name,
              color: route.transport_types.color,
            });
          });

          const addPointFallbackType = (record: PointTransportMetadata) => {
            const transportTypeId = record.transport_type_id;
            const transportType = record.transport_types;

            if (
              transportTypeId !== null &&
              transportTypeId !== undefined &&
              transportType &&
              !fallback.has(transportTypeId)
            ) {
              fallback.set(transportTypeId, {
                id: transportTypeId,
                name: transportType.name,
                color: transportType.color,
              });
            }
          };

          (stops as unknown as PointTransportMetadata[]).forEach(
            addPointFallbackType,
          );
          (terminals as unknown as PointTransportMetadata[]).forEach(
            addPointFallbackType,
          );

          setTransportTypes(
            [...fallback.values()].sort((left, right) =>
              left.name.localeCompare(right.name),
            ),
          );
        }
      } finally {
        if (active) setTransportTypesLoading(false);
      }
    }

    void loadTransportTypes();
    return () => {
      active = false;
    };
  }, [routeMapIndex.routes, stops, terminals]);

  // ==========================================================
  // SUPABASE REALTIME SUBSCRIPTION + RESUME RECOVERY
  // ==========================================================

  useEffect(() => {
    let refreshTimer: number | null = null;
    let disposed = false;

    const scheduleRefresh = () => {
      if (disposed) return;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);

      // Debounce row-level notifications from a single proposal transaction.
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshMapData();
      }, 300);
    };

    const unsubscribe = subscribeToMapSync(
      () => scheduleRefresh(),
      (status) => {
        setMapSyncStatus(status === "SUBSCRIBED" ? "connected" : "disconnected");
        if (status === "SUBSCRIBED") scheduleRefresh();
      },
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribe();
    };
  }, [refreshMapData]);

  // ==========================================================
  // LOAD SELECTED ROUTE DETAILS AND RESTORE SELECTION
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadSelectedRoute() {
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
      if (!isValidRouteId(requestedRouteId)) {
        setSelectedRouteId("");
        return;
      }

      setRouteStopsLoading(true);

      try {
        const { route: details } = await loadRouteLayer(requestedRouteId);
        if (!active) return;

        if (!isEligibleMapRoute(details)) {
          throw new Error("This route isn't available on the map.");
        }

        setSelectedRoute(details);
        setSelectedRouteStops(details.route_stops);

        // Restore a saved passenger journey.
        const pendingJourney = pendingSavedJourney.current;
        if (pendingJourney && pendingJourney.routeId === details.id) {
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
          // Restore a pending single boarding point.
          const pendingPoint = pendingBoardingPoint.current;
          pendingBoardingPoint.current = null;

          if (pendingPoint) {
            const index = findRouteStopIndex(details.route_stops, pendingPoint);
            if (index !== null) setBoardingIndex(index);
          }
        }
      } catch (error: unknown) {
        if (active) {
          pendingBoardingPoint.current = null;
          if (pendingSavedJourney.current?.routeId === requestedRouteId) {
            pendingSavedJourney.current = null;
          }
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load this route.",
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
  }, [loadRouteLayer, selectedRouteId, selectedRouteLoadVersion]);

  // ==========================================================
  // LOAD ASSIGNED VEHICLE FARE CONFIGURATION
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadFareOption() {
      setFareOption(null);
      setFareOptionError(null);

      if (!selectedRoute || !isEligibleMapRoute(selectedRoute)) {
        setFareOptionLoading(false);
        return;
      }

      setFareOptionLoading(true);
      try {
        const option = await getRouteFareOption(
          selectedRoute.transport_variants.id,
          currentUserId,
        );
        if (active) setFareOption(option);
      } catch (error: unknown) {
        if (active) {
          setFareOptionError(
            error instanceof Error
              ? error.message
              : "Unable to load the assigned vehicle fare.",
          );
        }
      } finally {
        if (active) setFareOptionLoading(false);
      }
    }

    void loadFareOption();
    return () => {
      active = false;
    };
  }, [selectedRoute, currentUserId]);

  // ==========================================================
  // LOAD RAIL STATION-TO-STATION FARE
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function loadRailFare() {
      if (
        !selectedRoute ||
        !isEligibleMapRoute(selectedRoute) ||
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
          alight.ref_id,
          currentUserId,
        );
        if (active) setRailFare(fare);
      } catch (error: unknown) {
        if (active) {
          setRailFareError(
            error instanceof Error
              ? error.message
              : "Unable to load the rail fare.",
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
  }, [
    selectedRoute,
    selectedRouteStops,
    boardingIndex,
    destinationIndex,
    currentUserId,
  ]);

  // ==========================================================
  // DERIVED ROUTE DISPLAY VALUES
  // ==========================================================

  const routeColor = selectedRoute?.transport_types.color ?? "#2563eb";
  const isRailRoute = selectedRoute?.transport_variants.fare_model === "matrix";
  const originName = selectedRouteStops[0]?.name;
  const destinationName = selectedRouteStops[selectedRouteStops.length - 1]?.name;

  const selectedPlaceImages = selectedPlace
    ? pointImages[`${selectedPlace.kind}-${selectedPlace.ref_id}`] ?? []
    : [];
  const selectedPlaceImage = selectedPlaceImages[0];

  // ==========================================================
  // TRIP ENDPOINTS
  // ==========================================================

  const boardingStop =
    boardingIndex !== null ? selectedRouteStops[boardingIndex] : null;
  const destinationStop =
    destinationIndex !== null ? selectedRouteStops[destinationIndex] : null;

  const hasTripSegment =
    !!selectedRoute &&
    isEligibleMapRoute(selectedRoute) &&
    boardingIndex !== null &&
    destinationIndex !== null &&
    destinationIndex !== boardingIndex &&
    boardingStop?.route_id === selectedRoute.id &&
    destinationStop?.route_id === selectedRoute.id;

  // ==========================================================
  // JOURNEY GEOMETRY
  // ==========================================================

  const loadedSelectedRoute = selectedRouteLayer?.route;
  const selectedLayerMatchesRoute =
    !!selectedRoute &&
    isEligibleMapRoute(selectedRoute) &&
    selectedRoute.id === Number(selectedRouteId) &&
    !!loadedSelectedRoute &&
    loadedSelectedRoute.id === selectedRoute.id &&
    isEligibleMapRoute(loadedSelectedRoute);

  const journeyGeometry = useMemo<RouteGeometrySegment | null>(() => {
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
  ]);

  /** Keep the pending saved-journey transition focused on its selected route. */
  const isJourneyViewActive =
    hasTripSegment || pendingSavedJourney.current !== null;

  const journeyGeometryError =
    !hasTripSegment || !selectedLayerMatchesRoute || !selectedRouteLayer
      ? null
      : selectedRouteLayer.status === "loading"
        ? null
        : selectedRouteLayer.status === "error"
          ? selectedRouteLayer.error ?? "Unable to load the journey geometry."
          : !journeyGeometry
            ? "Unable to extract the journey segment. Check the selected endpoints and snapped waypoints."
            : null;

  const tripDurationSeconds = journeyGeometry?.durationSeconds ?? null;

  // ==========================================================
  // TRIP DISTANCE
  // ==========================================================

  const tripDistanceMeters = hasTripSegment
    ? getTripDistanceMeters(stopDistances, boardingIndex, destinationIndex)
    : null;

  // ==========================================================
  // FARE ESTIMATES
  // ==========================================================

  const fareOptionEstimates =
    hasTripSegment && tripDistanceMeters !== null && fareOption
      ? calculateFareOptionEstimates([fareOption], tripDistanceMeters)
      : [];

  const fareCards = buildFareCards(
    fareOptionEstimates,
    railFare,
    isRailRoute ? selectedRoute?.transport_variants.id ?? null : null,
  );

  // ==========================================================
  // TRIP STOP SELECTION
  // ==========================================================

  const handleTripStop = (index: number) => {
    const selection = selectTripStop(
      { boardingIndex, destinationIndex },
      index,
    );
    setBoardingIndex(selection.boardingIndex);
    setDestinationIndex(selection.destinationIndex);
  };

  // ==========================================================
  // ROUTE LIST STOP SELECTION
  // ==========================================================

  /**
   * Route-list selections update trip endpoints, selected place/photo history,
   * and the set of route layers serving that exact stop or terminal.
   */
  const handleRouteListPick = (index: number) => {
    const routeStop = selectedRouteStops[index];
    if (!routeStop) return;

    const mapPoint = mapPoints.find(
      (point) =>
        point.kind === routeStop.kind &&
        point.ref_id === routeStop.ref_id &&
        isEligibleMapPoint(point),
    );

    if (mapPoint) {
      recordPhotoPointSelection(mapPoint, "route-list");
      setSelectedPlacePoint(mapPoint);
      setSelectionError(null);

      // A route-list-selected stop follows the same map scope as a map
      // selection: show every eligible route serving it, not only the
      // route currently displayed in the passenger panel.
      loadVisibleRouteLayers(
        mapPoint.routes
          .filter(({ route }) => isEligibleMapRoute(route))
          .map(({ route }) => route.id),
      );
    }

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

    // Keep the active route/place focus. Clearing the passenger endpoints
    // must not reveal unrelated routes or hide the route serving the place.
    setRouteLinesVisible(
      Boolean(selectedRouteId) || Boolean(selectedPlace?.routes.length),
    );
  };

  // ==========================================================
  // CLEAR SELECTED ROUTE AND ALL ROUTE DRAWING
  // ==========================================================

  const clearSelectedRoute = () => {
    pendingBoardingPoint.current = null;
    pendingSavedJourney.current = null;
    setBoardingIndex(null);
    setDestinationIndex(null);

    setRouteLineFocusActive(false);
    setVisibleRouteIds([]);
    setRouteLinesVisible(false);
    setSelectedRouteId("");
    clearPhotoSession();
    setSelectedPlacePoint(null);
  };

  // ==========================================================
  // VEHICLE FILTER ACTIONS
  // ==========================================================

  const handleVehicleFilterSelect = (transportTypeId: number) => {
    if (
      !Number.isSafeInteger(transportTypeId) ||
      !transportTypes.some((type) => type.id === transportTypeId)
    ) {
      return;
    }

    setActiveTransportTypeId(transportTypeId);
    setSelectionError(null);

    const selectedRouteCatalogEntry = routeMapIndex.routes.find(
      (route) =>
        route.id === Number(selectedRouteId) && isEligibleMapRoute(route),
    );
    const selectedRouteTypeId =
      selectedRouteCatalogEntry?.transport_type_id ?? null;

    if (
      selectedRouteId &&
      selectedRouteTypeId !== null &&
      selectedRouteTypeId !== transportTypeId
    ) {
      pendingBoardingPoint.current = null;
      pendingSavedJourney.current = null;
      setBoardingIndex(null);
      setDestinationIndex(null);

      setRouteLineFocusActive(false);
      setVisibleRouteIds([]);
      setRouteLinesVisible(false);
      setSelectedRouteId("");
    }

    if (selectedPlacePoint) {
      const selectedPoint = mapPoints.find(
        (point) =>
          point.kind === selectedPlacePoint.kind &&
          point.ref_id === selectedPlacePoint.ref_id &&
          isEligibleMapPoint(point),
      );

      const associatedTypeIds = new Set(
        selectedPoint?.routes.map(({ route }) => route.transport_type_id) ?? [],
      );

      const selectedPointMatches = selectedPoint
        ? associatedTypeIds.size > 0
          ? associatedTypeIds.has(transportTypeId)
          : selectedPoint.transport_type_id === transportTypeId
        : false;

      if (!selectedPointMatches) {
        clearPhotoSession();
        setSelectedPlacePoint(null);
      }
    }
  };

  const clearVehicleFilter = () => {
    setActiveTransportTypeId(null);
  };

  // ==========================================================
  // SELECT MAP PLACE
  // ==========================================================

  const handlePlaceSelect = (point: RouteMapPoint) => {
    // Resolve the incoming object against the current eligible map collection.
    // This rejects stale markers/search results after an archive or refresh.
    const currentPoint = mapPoints.find(
      (candidate) =>
        candidate.kind === point.kind &&
        candidate.ref_id === point.ref_id &&
        isEligibleMapPoint(candidate),
    );

    if (!currentPoint) {
      setSelectionError("This location is no longer available on the map.");
      return;
    }

    // A manual location selection supersedes pending saved-journey restoration.
    pendingSavedJourney.current = null;
    setSelectionError(null);
    recordPhotoPointSelection(currentPoint, "map");
    setSelectedPlacePoint(currentPoint);

    // A place click exits any temporary route-line focus. Its own actual
    // serving route set becomes the new map focus below.
    if (routeLineFocusActive) {
      setRouteLineFocusActive(false);
    }

    loadVisibleRouteLayers(
      currentPoint.routes
        .filter(({ route }) => isEligibleMapRoute(route))
        .map(({ route }) => route.id),
    );

    setShowSearchResults(false);
    setSearchQuery("");
    setActiveSearchIndex(0);

    // If the selected route is already loaded and actually serves this point,
    // preserve the existing passenger boarding/destination interaction.
    if (selectedRoute && isEligibleMapRoute(selectedRoute)) {
      const routeStopIndex = findRouteStopIndex(selectedRouteStops, currentPoint);

      if (routeStopIndex !== null) {
        if (
          isRepeatedBoardingPoint(
            { boardingIndex, destinationIndex },
            routeStopIndex,
          )
        ) {
          clearTrip();
          return;
        }

        handleTripStop(routeStopIndex);
        return;
      }

      // The new point is not on the previously selected route. Release that
      // route and select the new point's unique serving route, if there is one.
      pendingBoardingPoint.current = null;
      pendingSavedJourney.current = null;
      setBoardingIndex(null);
      setDestinationIndex(null);
      setSelectedRouteId("");
    }

    // The route has been selected but its detail request is still loading.
    if (selectedRouteId && !selectedRoute) {
      const activeRouteId = Number(selectedRouteId);
      const belongsToLoadingRoute = currentPoint.routes.some(
        ({ route }) => route.id === activeRouteId,
      );

      if (belongsToLoadingRoute) {
        pendingBoardingPoint.current = {
          kind: currentPoint.kind,
          ref_id: currentPoint.ref_id,
        };
        setSelectedRouteLoadVersion((version) => version + 1);
        return;
      }

      pendingBoardingPoint.current = null;
      pendingSavedJourney.current = null;
      setBoardingIndex(null);
      setDestinationIndex(null);
      setSelectedRouteId("");
    }

    // Automatically select only a unique serving route. Multiple serving
    // routes remain visible together until the passenger chooses a line.
    const uniqueRoute = getUniqueServingRoute(currentPoint);
    if (!uniqueRoute || !isEligibleMapRoute(uniqueRoute)) return;

    pendingBoardingPoint.current = {
      kind: currentPoint.kind,
      ref_id: currentPoint.ref_id,
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
      coordinates: [latitude, longitude],
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
    const eligibleRoute = routeMapIndex.routes.find(
      (route) => route.id === routeId && isEligibleMapRoute(route),
    );
    if (!eligibleRoute) return;

    const nextRouteId = String(routeId);

    if (selectedRouteId === nextRouteId && routeLineFocusActive) {
      setSelectionError(null);
      clearSelectedRoute();
      return;
    }

    pendingSavedJourney.current = null;
    pendingBoardingPoint.current = null;
    setSelectionError(null);
    setRouteLineFocusActive(true);
    setRouteLinesVisible(true);
    setVisibleRouteIds([routeId]);
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
      const currentRoute = routeMapIndex.routes.find(
        (route) => route.id === result.route.id && isEligibleMapRoute(route),
      );

      if (!currentRoute) {
        setSelectionError("This route is no longer available on the map.");
        return;
      }

      pendingBoardingPoint.current = null;
      clearPhotoSession();
      setSelectedPlacePoint(null);
      setRouteLineFocusActive(false);

      loadVisibleRouteLayers([currentRoute.id]);
      setBoardingIndex(null);
      setDestinationIndex(null);
      setSelectedRouteId(String(currentRoute.id));
      return;
    }

    handlePlaceSelect(result.point);
  };

  // ==========================================================
  // SEARCH RESULT SELECTION
  // ==========================================================

  const handleSearchResultSelect = (result: RouteMapSearchResult) => {
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
      setSelectionError("This item is no longer available on the map.");
      return false;
    }

    // Journey bookmark.
    if (selection.bookmarkType === "journey") {
      if (result.kind !== "route" || !selection.journey) {
        pendingSavedJourney.current = null;
        setSelectionError("This saved journey contains invalid route information.");
        return false;
      }

      const routeId = result.route.id;
      const { origin, destination } = selection.journey;

      const endpointBelongsToRoute = (
        endpoint: SavedJourneyEndpoint,
      ): boolean => {
        const point = mapPoints.find(
          (item) =>
            item.kind === endpoint.kind &&
            item.ref_id === endpoint.id &&
            isEligibleMapPoint(item),
        );

        return (
          point?.routes.some(
            ({ route }) => route.id === routeId && isEligibleMapRoute(route),
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

      setSelectionError(null);
      setSearchQuery("");
      setShowSearchResults(false);
      setActiveSearchIndex(0);
      clearPhotoSession();
      setSelectedPlacePoint(null);
      pendingBoardingPoint.current = null;
      setRouteLineFocusActive(false);
      loadVisibleRouteLayers([routeId]);

      const originReference = toRoutePointReference(origin);
      const destinationReference = toRoutePointReference(destination);

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

      pendingSavedJourney.current = { routeId, origin, destination };
      setSelectedRouteLoadVersion((version) => version + 1);
      const targetRouteId = String(routeId);
      if (selectedRouteId !== targetRouteId) {
        setSelectedRouteId(targetRouteId);
      }
      return true;
    }

    // Whole route, stop, or terminal bookmark.
    pendingSavedJourney.current = null;
    applySearchResultSelection(result, "restore");
    return true;
  };

  // ==========================================================
  // CLOSE PLACE DETAILS
  // ==========================================================

  const closePlace = () => {
    clearPhotoSession();
    setSelectedPlacePoint(null);

    // Closing a place panel during a complete passenger journey only closes
    // the place details/gallery. Preserve the selected route, journey segment,
    // boarding point, and destination.
    if (isJourneyViewActive) return;

    // Outside a complete journey, closing place details clears the temporary
    // place/route focus and returns all eligible map points to the map.
    pendingBoardingPoint.current = null;
    pendingSavedJourney.current = null;
    setBoardingIndex(null);
    setDestinationIndex(null);
    setSelectedRouteId("");
    setRouteLineFocusActive(false);
    setVisibleRouteIds([]);
    setRouteLinesVisible(false);
  };

  // ==========================================================
  // KEYBOARD SEARCH
  // ==========================================================

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setShowSearchResults(false);
      return;
    }

    if (!showSearchResults || searchResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchIndex((index) =>
        index >= searchResults.length - 1 ? 0 : index + 1,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchIndex((index) =>
        index <= 0 ? searchResults.length - 1 : index - 1,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleSearchResultSelect(searchResults[activeSearchIndex]);
    }
  };

  // ==========================================================
  // MAP POINT ICONS
  // ==========================================================

  const pointIcon = (index: number, stop: RouteStop) => {
    const vehicleType = getMapVehicleType(
      selectedRoute?.transport_types.name ?? "",
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

  // ==========================================================
  // RETURN MAP CONTROLLER
  // ==========================================================

  return {
    // Location
    currentPosition,
    locationStatus,
    locationError,
    showLocationPopup,
    requestCurrentLocation,

    // Loading / errors
    stopsLoading,
    stopError,
    terminalsLoading,
    terminalError,
    routesLoading,
    routeMapError,
    routeError,
    selectionError,
    mapSyncStatus,
    routeStopsLoading,
    roadRouteLoading,
    routeMapIndex,

    // Map data
    mapPoints,
    displayedMapPoints,
    displayedAssociationRouteIds,
    routeLineFocusActive,
    transportTypes,
    transportTypesLoading,
    activeTransportTypeId,
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

    // Route selection
    selectedRouteId,
    selectedRoute,
    selectedRouteStops,

    // Trip selection
    boardingIndex,
    destinationIndex,
    boardingStop,
    destinationStop,
    hasTripSegment,
    isJourneyViewActive,

    // Route geometry
    routeColor,
    isRailRoute,
    routeDistanceMeters,
    routeDurationSeconds,
    journeyGeometry,
    journeyGeometryError,
    tripDurationSeconds,

    // Journey distance
    tripDistanceMeters,

    // Fares
    fareOption,
    fareOptionLoading,
    fareOptionError,
    railFareLoading,
    railFareError,
    fareCards,

    // Route endpoint names
    originName,
    destinationName,

    // Search
    searchQuery,
    setSearchQuery,
    searchResults,
    showSearchResults,
    setShowSearchResults,
    activeSearchIndex,
    setActiveSearchIndex,

    // Actions
    pointIcon,
    handlePlaceSelect,
    handleVehicleFilterSelect,
    clearVehicleFilter,
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
    closePlace,
  };
}

// ============================================================
// CONTROLLER TYPE
// ============================================================

export type TransitMapController = ReturnType<typeof useTransitMap>;
