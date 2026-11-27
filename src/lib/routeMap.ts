import type { PointKind, RouteStop, StopType } from "./routes";
import type { Stop } from "./stops";
import type { Terminal } from "./terminals";
import type { SavedJourneyEndpoint, SavedKind } from "./savedItems";

// ============================================================
// TYPES
// ============================================================

export interface RouteMapRoute {
  id: number;
  name: string;
  transport_type_id: number;
  is_active: boolean;
  is_deleted: boolean;
  transport_types: {
    name: string;
    color: string;
  };
}

export interface RouteMapRawPoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  stop_type?: "road_stop" | "train_station";
  description?: string | null;
  is_active: boolean;
  is_deleted: boolean;
  is_approved?: boolean;
}

export interface RouteMapRouteRecord extends RouteMapRoute {
  route_stops: {
    route_id: number;
    stop_order: number;
    terminals: RouteMapRawPoint | null;
    stops: RouteMapRawPoint | null;
  }[];
}

/**
 * Unified map location.
 *
 * A point can exist independently of any public transit route.
 * Independent locations have routes: []. Route-associated locations retain
 * their actual serving routes and their respective ordered stop positions.
 *
 * Status fields are deliberately carried into the unified point so a stale,
 * deleted, or inactive record cannot become visible through route merging.
 */
export interface RouteMapPoint {
  kind: PointKind;
  ref_id: number;
  name: string;
  latitude: number;
  longitude: number;
  stop_type: StopType;
  description: string | null;
  is_active: boolean;
  is_deleted: boolean;
  routes: {
    route: RouteMapRoute;
    stop_order: number;
  }[];
}

export interface RouteMapIndex {
  routes: RouteMapRoute[];
  points: RouteMapPoint[];
}

export type RouteMapSearchResult =
  | {
      kind: "route";
      route: RouteMapRoute;
    }
  | {
      kind: "point";
      point: RouteMapPoint;
    };

// ============================================================
// SAVED MAP SELECTION TYPES
// ============================================================

export interface SavedMapJourney {
  origin: SavedJourneyEndpoint;
  destination: SavedJourneyEndpoint;
}

export interface ParsedSavedMapSelection {
  kind: SavedKind;
  targetId: number;
  /** Exact saved_routes.id. Null for individual points and legacy navigation. */
  bookmarkId: number | null;
  /** Distinguishes whole-route bookmarks from journey bookmarks. */
  bookmarkType: "whole_route" | "journey" | null;
  /** Populated only for saved journey bookmarks. */
  journey: SavedMapJourney | null;
}

// ============================================================
// GENERAL VALIDATION
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isValidCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** A map point is visible only when both values are explicitly eligible. */
export function isEligibleMapPoint(
  point: Pick<RouteMapPoint, "is_active" | "is_deleted">,
): boolean {
  return point.is_active === true && point.is_deleted === false;
}

/** A map route is visible only when both values are explicitly eligible. */
export function isEligibleMapRoute(
  route: Pick<RouteMapRoute, "is_active" | "is_deleted">,
): boolean {
  return route.is_active === true && route.is_deleted === false;
}

function isEligibleRawPoint(point: RouteMapRawPoint): boolean {
  return point.is_active === true && point.is_deleted === false;
}

// ============================================================
// MAP POINT IDENTITY
// ============================================================

/** Include kind because a stop and terminal can share the same numeric ID. */
function getMapPointKey(kind: PointKind, id: number): string {
  return `${kind}-${id}`;
}

/** Clone the route associations so merging never mutates the source index. */
function cloneMapPoint(point: RouteMapPoint): RouteMapPoint {
  return {
    ...point,
    routes: point.routes.map((association) => ({
      route: association.route,
      stop_order: association.stop_order,
    })),
  };
}

// ============================================================
// SAVED JOURNEY ENDPOINT PARSER
// ============================================================

function parseSavedJourneyEndpoint(
  value: unknown,
): SavedJourneyEndpoint | null {
  if (!isRecord(value)) return null;

  const { kind, id } = value;
  if (
    (kind !== "stop" && kind !== "terminal") ||
    !isPositiveSafeInteger(id)
  ) {
    return null;
  }

  return { kind, id };
}

// ============================================================
// SAVED MAP SELECTION PARSER
// ============================================================

/**
 * Parses navigation state generated by saved.tsx.
 * Supports whole-route bookmarks, journey bookmarks, individual points,
 * and legacy route navigation.
 */
export function parseSavedMapSelection(
  state: unknown,
): ParsedSavedMapSelection | null {
  if (!isRecord(state) || !isRecord(state.savedSelection)) return null;

  const selection = state.savedSelection;
  const { kind, targetId } = selection;

  if (
    (kind !== "route" && kind !== "stop" && kind !== "terminal") ||
    !isPositiveSafeInteger(targetId)
  ) {
    return null;
  }

  // Individual stop or terminal.
  if (kind !== "route") {
    return {
      kind,
      targetId,
      bookmarkId: null,
      bookmarkType: null,
      journey: null,
    };
  }

  // Legacy route selection support.
  let bookmarkId: number | null = null;
  const rawBookmarkId = selection.bookmarkId;
  if (rawBookmarkId !== undefined && rawBookmarkId !== null) {
    if (!isPositiveSafeInteger(rawBookmarkId)) return null;
    bookmarkId = rawBookmarkId;
  }

  const rawBookmarkType = selection.bookmarkType;

  // Older sources such as recent searches may only send kind and targetId.
  if (rawBookmarkType === undefined || rawBookmarkType === null) {
    if (selection.journey !== undefined && selection.journey !== null) {
      return null;
    }

    return {
      kind: "route",
      targetId,
      bookmarkId,
      bookmarkType: null,
      journey: null,
    };
  }

  // Whole-route bookmark.
  if (rawBookmarkType === "whole_route") {
    if (
      bookmarkId === null ||
      (selection.journey !== undefined && selection.journey !== null)
    ) {
      return null;
    }

    return {
      kind: "route",
      targetId,
      bookmarkId,
      bookmarkType: "whole_route",
      journey: null,
    };
  }

  // Journey bookmark.
  if (rawBookmarkType === "journey") {
    if (bookmarkId === null || !isRecord(selection.journey)) return null;

    const origin = parseSavedJourneyEndpoint(selection.journey.origin);
    const destination = parseSavedJourneyEndpoint(
      selection.journey.destination,
    );
    if (!origin || !destination) return null;

    const sameEndpoint =
      origin.kind === destination.kind && origin.id === destination.id;
    if (sameEndpoint) return null;

    return {
      kind: "route",
      targetId,
      bookmarkId,
      bookmarkType: "journey",
      journey: { origin, destination },
    };
  }

  // Unknown bookmark types are rejected.
  return null;
}

// ============================================================
// RESOLVE SAVED MAP SELECTION
// ============================================================

export function resolveSavedMapSelection(
  routeMapIndex: RouteMapIndex,
  mapPoints: RouteMapPoint[],
  kind: SavedKind,
  targetId: number,
): RouteMapSearchResult | null {
  if (kind === "route") {
    const route = routeMapIndex.routes.find(
      (item) => item.id === targetId && isEligibleMapRoute(item),
    );

    return route ? { kind: "route", route } : null;
  }

  const point = mapPoints.find(
    (item) =>
      item.kind === kind &&
      item.ref_id === targetId &&
      isEligibleMapPoint(item),
  );

  return point ? { kind: "point", point } : null;
}

// ============================================================
// TRIP SELECTION TYPES
// ============================================================

export interface TripSelection {
  boardingIndex: number | null;
  destinationIndex: number | null;
}

// ============================================================
// BOARDING POINT VALIDATION
// ============================================================

export function isRepeatedBoardingPoint(
  selection: TripSelection,
  clickedIndex: number,
): boolean {
  return (
    selection.boardingIndex !== null &&
    clickedIndex === selection.boardingIndex
  );
}

// ============================================================
// DISPLAYED ROUTE IDS
// ============================================================

export function getDisplayedRouteIds(
  visibleRouteIds: number[],
  selectedRouteId: string,
  routeLinesVisible: boolean,
): number[] {
  if (!routeLinesVisible) return [];

  return [
    ...new Set([
      ...visibleRouteIds,
      ...(selectedRouteId ? [Number(selectedRouteId)] : []),
    ]),
  ];
}

// ============================================================
// UNIQUE SERVING ROUTE
// ============================================================

/** Returns a route only when exactly one eligible route serves the point. */
export function getUniqueServingRoute(
  point: RouteMapPoint,
): RouteMapRoute | null {
  const routes = point.routes.filter((item) =>
    isEligibleMapRoute(item.route),
  );
  return routes.length === 1 ? routes[0].route : null;
}

// ============================================================
// OVERLAPPING ROUTE SELECTION
// ============================================================

export function getNextOverlappingRouteId(
  routeIds: number[],
  activeRouteId: number | null,
  clickedRouteId: number,
): number {
  const uniqueRouteIds = [...new Set(routeIds)];
  const activeIndex =
    activeRouteId === null ? -1 : uniqueRouteIds.indexOf(activeRouteId);

  if (activeIndex < 0 || uniqueRouteIds.length < 2) {
    return clickedRouteId;
  }

  return uniqueRouteIds[(activeIndex + 1) % uniqueRouteIds.length];
}

// ============================================================
// BUILD ROUTE MAP INDEX
// ============================================================

/**
 * Builds the route-oriented portion of the map index.
 *
 * An eligible route remains in the map when at least one of its associated
 * locations is eligible. Inactive or deleted stops/terminals are excluded
 * individually; they do not invalidate the route or its other locations.
 * Independent stops and terminals are added later by mergeMapLocations().
 */
export function buildRouteMapIndex(
  records: RouteMapRouteRecord[],
): RouteMapIndex {
  const eligibleRecords = records
    .filter((record) =>
      isEligibleMapRoute(record) && Array.isArray(record.route_stops),
    )
    .map((record) => ({
      ...record,
      // Keep only actual, eligible route associations. This filtered ordered
      // sequence is also what the route-detail loader uses for geometry.
      route_stops: record.route_stops.filter((row) => {
        if (row.terminals !== null && row.stops === null) {
          return isEligibleRawPoint(row.terminals);
        }

        if (row.stops !== null && row.terminals === null) {
          return isEligibleRawPoint(row.stops);
        }

        return false;
      }),
    }))
    // A route with no eligible location cannot provide a drawable map path.
    // A route with one eligible point remains in the index, though a line
    // requires at least two eligible coordinates.
    .filter((record) => record.route_stops.length > 0);

  const routes: RouteMapRoute[] = eligibleRecords.map(
    ({
      id,
      name,
      transport_type_id,
      is_active,
      is_deleted,
      transport_types,
    }) => ({
      id,
      name,
      transport_type_id,
      is_active,
      is_deleted,
      transport_types,
    }),
  );

  const routesById = new Map(routes.map((route) => [route.id, route]));
  const pointsByKey = new Map<string, RouteMapPoint>();

  eligibleRecords.forEach((record) => {
    const route = routesById.get(record.id);
    if (!route) return;

    record.route_stops.forEach((row) => {
      let point: RouteMapPoint;

      if (row.terminals && row.stops === null) {
        point = {
          kind: "terminal",
          ref_id: row.terminals.id,
          name: row.terminals.name,
          latitude: row.terminals.latitude,
          longitude: row.terminals.longitude,
          stop_type: "terminal",
          description: null,
          is_active: row.terminals.is_active,
          is_deleted: row.terminals.is_deleted,
          routes: [],
        };
      } else if (row.stops && row.terminals === null) {
        point = {
          kind: "stop",
          ref_id: row.stops.id,
          name: row.stops.name,
          latitude: row.stops.latitude,
          longitude: row.stops.longitude,
          stop_type: row.stops.stop_type ?? "road_stop",
          description: row.stops.description ?? null,
          is_active: row.stops.is_active,
          is_deleted: row.stops.is_deleted,
          routes: [],
        };
      } else {
        // Defensive: invalid associations were removed above.
        return;
      }

      const key = getMapPointKey(point.kind, point.ref_id);
      const existing = pointsByKey.get(key);
      if (!existing) pointsByKey.set(key, point);
      const target = existing ?? point;

      // Preserve unique route associations and the earliest stop order.
      const association = target.routes.find(
        (item) => item.route.id === route.id,
      );

      if (!association) {
        target.routes.push({ route, stop_order: row.stop_order });
      } else if (row.stop_order < association.stop_order) {
        association.stop_order = row.stop_order;
      }
    });
  });

  return { routes, points: [...pointsByKey.values()] };
}

// ============================================================
// MERGE INDEPENDENT MAP LOCATIONS
// ============================================================

/**
 * Combines route-associated locations with independently loaded public stops
 * and terminals. Duplicate identities are merged by kind + record ID.
 *
 * The strict status check is applied to both sources, so a location cannot
 * re-enter the map through the independent-location collection after it was
 * excluded from a route association.
 */
export function mergeMapLocations(
  index: RouteMapIndex,
  stops: Stop[],
  terminals: Terminal[],
): RouteMapPoint[] {
  const pointsByKey = new Map<string, RouteMapPoint>();

  // Copy eligible route-associated locations only.
  index.points.forEach((point) => {
    if (!isEligibleMapPoint(point)) return;

    const eligibleRoutes = point.routes.filter((association) =>
      isEligibleMapRoute(association.route),
    );
    const key = getMapPointKey(point.kind, point.ref_id);
    pointsByKey.set(key, cloneMapPoint({ ...point, routes: eligibleRoutes }));
  });

  // Merge independent stops.
  stops.forEach((stop) => {
    if (
      stop.is_active !== true ||
      stop.is_deleted !== false ||
      !isPositiveSafeInteger(stop.id) ||
      !isValidCoordinates(stop.latitude, stop.longitude)
    ) {
      return;
    }

    const key = getMapPointKey("stop", stop.id);
    const existing = pointsByKey.get(key);

    if (existing) {
      existing.name = stop.name;
      existing.latitude = stop.latitude;
      existing.longitude = stop.longitude;
      existing.stop_type = stop.stop_type;
      existing.description = stop.description;
      existing.is_active = stop.is_active;
      existing.is_deleted = stop.is_deleted;
      return;
    }

    pointsByKey.set(key, {
      kind: "stop",
      ref_id: stop.id,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      stop_type: stop.stop_type,
      description: stop.description,
      is_active: stop.is_active,
      is_deleted: stop.is_deleted,
      routes: [],
    });
  });

  // Merge independent terminals.
  terminals.forEach((terminal) => {
    if (
      terminal.is_active !== true ||
      terminal.is_deleted !== false ||
      !isPositiveSafeInteger(terminal.id) ||
      !isValidCoordinates(terminal.latitude, terminal.longitude)
    ) {
      return;
    }

    const key = getMapPointKey("terminal", terminal.id);
    const existing = pointsByKey.get(key);

    if (existing) {
      existing.name = terminal.name;
      existing.latitude = terminal.latitude;
      existing.longitude = terminal.longitude;
      existing.stop_type = "terminal";
      existing.is_active = terminal.is_active;
      existing.is_deleted = terminal.is_deleted;
      return;
    }

    pointsByKey.set(key, {
      kind: "terminal",
      ref_id: terminal.id,
      name: terminal.name,
      latitude: terminal.latitude,
      longitude: terminal.longitude,
      stop_type: "terminal",
      description: null,
      is_active: terminal.is_active,
      is_deleted: terminal.is_deleted,
      routes: [],
    });
  });

  return [...pointsByKey.values()];
}

// ============================================================
// BACKWARD-COMPATIBLE TERMINAL MERGING
// ============================================================

/** Compatibility wrapper for callers that only merge terminals. */
export function mergeMapTerminals(
  index: RouteMapIndex,
  terminals: Terminal[],
): RouteMapPoint[] {
  return mergeMapLocations(index, [], terminals);
}

// ============================================================
// SEARCH ROUTE MAP ITEMS
// ============================================================

export function searchRouteMapItems(
  routes: RouteMapRoute[],
  points: RouteMapPoint[],
  query: string,
): RouteMapSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  return [
    ...routes
      .filter(
        (route) =>
          isEligibleMapRoute(route) &&
          route.name.toLowerCase().includes(normalizedQuery),
      )
      .map(
        (route): RouteMapSearchResult => ({ kind: "route", route }),
      ),
    ...points
      .filter(
        (point) =>
          isEligibleMapPoint(point) &&
          point.name.toLowerCase().includes(normalizedQuery),
      )
      .map(
        (point): RouteMapSearchResult => ({ kind: "point", point }),
      ),
  ];
}

// ============================================================
// FIND ROUTE STOP INDEX
// ============================================================

export function findRouteStopIndex(
  stops: RouteStop[],
  point: Pick<RouteMapPoint, "kind" | "ref_id">,
): number | null {
  const index = stops.findIndex(
    (stop) => stop.kind === point.kind && stop.ref_id === point.ref_id,
  );
  return index < 0 ? null : index;
}

// ============================================================
// SELECT TRIP STOP
// ============================================================

export function selectTripStop(
  selection: TripSelection,
  clickedIndex: number,
): TripSelection {
  if (!Number.isInteger(clickedIndex) || clickedIndex < 0) return selection;

  if (
    selection.boardingIndex === null ||
    clickedIndex === selection.boardingIndex
  ) {
    return { boardingIndex: clickedIndex, destinationIndex: null };
  }

  return { ...selection, destinationIndex: clickedIndex };
}

// ============================================================
// TRIP DISTANCE
// ============================================================

export function getTripDistanceMeters(
  stopDistances: number[],
  boardingIndex: number | null,
  destinationIndex: number | null,
): number | null {
  if (
    boardingIndex === null ||
    destinationIndex === null ||
    boardingIndex === destinationIndex ||
    !Number.isInteger(boardingIndex) ||
    !Number.isInteger(destinationIndex) ||
    boardingIndex < 0 ||
    destinationIndex < 0 ||
    boardingIndex >= stopDistances.length ||
    destinationIndex >= stopDistances.length
  ) {
    return null;
  }

  const boardingDistance = stopDistances[boardingIndex];
  const destinationDistance = stopDistances[destinationIndex];
  if (
    !Number.isFinite(boardingDistance) ||
    !Number.isFinite(destinationDistance)
  ) {
    return null;
  }

  return Math.abs(destinationDistance - boardingDistance);
}
