import type { PointKind, RouteStop, StopType } from "./routes";
import type { Terminal } from "./terminals";

export interface RouteMapRoute {
  id: number;
  name: string;
  transport_type_id: number;
  transport_types: { name: string; color: string };
}

export interface RouteMapRawPoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  stop_type?: "road_stop" | "train_station";
  description?: string | null;
  is_active?: boolean;
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

export interface RouteMapPoint {
  kind: PointKind;
  ref_id: number;
  name: string;
  latitude: number;
  longitude: number;
  stop_type: StopType;
  description: string | null;
  routes: { route: RouteMapRoute; stop_order: number }[];
}

export interface RouteMapIndex {
  routes: RouteMapRoute[];
  points: RouteMapPoint[];
}

export type RouteMapSearchResult =
  | { kind: "route"; route: RouteMapRoute }
  | { kind: "point"; point: RouteMapPoint };

export interface TripSelection {
  boardingIndex: number | null;
  destinationIndex: number | null;
}

export function isRepeatedBoardingPoint(
  selection: TripSelection,
  clickedIndex: number
): boolean {
  return (
    selection.boardingIndex !== null &&
    clickedIndex === selection.boardingIndex
  );
}

export function getDisplayedRouteIds(
  visibleRouteIds: number[],
  selectedRouteId: string,
  routeLinesVisible: boolean
): number[] {
  if (!routeLinesVisible) return [];

  return [
    ...new Set([
      ...visibleRouteIds,
      ...(selectedRouteId ? [Number(selectedRouteId)] : []),
    ]),
  ];
}

export function getUniqueServingRoute(
  point: RouteMapPoint
): RouteMapRoute | null {
  return point.routes.length === 1 ? point.routes[0].route : null;
}

export function getNextOverlappingRouteId(
  routeIds: number[],
  activeRouteId: number | null,
  clickedRouteId: number
): number {
  const uniqueRouteIds = [...new Set(routeIds)];
  const activeIndex = activeRouteId === null
    ? -1
    : uniqueRouteIds.indexOf(activeRouteId);

  if (activeIndex < 0 || uniqueRouteIds.length < 2) return clickedRouteId;
  return uniqueRouteIds[(activeIndex + 1) % uniqueRouteIds.length];
}

export function buildRouteMapIndex(
  records: RouteMapRouteRecord[]
): RouteMapIndex {
  const routes = records.map(
    ({ id, name, transport_type_id, transport_types }) => ({
      id,
      name,
      transport_type_id,
      transport_types,
    })
  );
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const pointsByKey = new Map<string, RouteMapPoint>();

  records.forEach((record) => {
    const route = routesById.get(record.id);
    if (!route) return;

    record.route_stops.forEach((row) => {
      let point: RouteMapPoint | null = null;

      if (row.terminals && row.terminals.is_active !== false) {
        point = {
          kind: "terminal",
          ref_id: row.terminals.id,
          name: row.terminals.name,
          latitude: row.terminals.latitude,
          longitude: row.terminals.longitude,
          stop_type: "terminal",
          description: null,
          routes: [],
        };
      } else if (row.stops) {
        point = {
          kind: "stop",
          ref_id: row.stops.id,
          name: row.stops.name,
          latitude: row.stops.latitude,
          longitude: row.stops.longitude,
          stop_type: row.stops.stop_type ?? "road_stop",
          description: row.stops.description ?? null,
          routes: [],
        };
      }

      if (!point) return;

      const key = `${point.kind}-${point.ref_id}`;
      const existing = pointsByKey.get(key);
      if (!existing) {
        pointsByKey.set(key, point);
      }

      const target = existing ?? point;
      const association = target.routes.find(
        (item) => item.route.id === route.id
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

export function mergeMapTerminals(
  index: RouteMapIndex,
  terminals: Terminal[]
): RouteMapPoint[] {
  const points = new Map(
    index.points.map((point) => [
      `${point.kind}-${point.ref_id}`,
      { ...point, routes: [...point.routes] },
    ])
  );

  terminals
    .filter((terminal) => terminal.is_active)
    .forEach((terminal) => {
      const key = `terminal-${terminal.id}`;
      const existing = points.get(key);

      if (existing) {
        existing.name = terminal.name;
        existing.latitude = terminal.latitude;
        existing.longitude = terminal.longitude;
        return;
      }

      points.set(key, {
        kind: "terminal",
        ref_id: terminal.id,
        name: terminal.name,
        latitude: terminal.latitude,
        longitude: terminal.longitude,
        stop_type: "terminal",
        description: null,
        routes: [],
      });
    });

  return [...points.values()];
}

export function searchRouteMapItems(
  routes: RouteMapRoute[],
  points: RouteMapPoint[],
  query: string
): RouteMapSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  return [
    ...routes
      .filter((route) => route.name.toLowerCase().includes(normalizedQuery))
      .map((route): RouteMapSearchResult => ({ kind: "route", route })),
    ...points
      .filter((point) => point.name.toLowerCase().includes(normalizedQuery))
      .map((point): RouteMapSearchResult => ({ kind: "point", point })),
  ];
}

export function findRouteStopIndex(
  stops: RouteStop[],
  point: Pick<RouteMapPoint, "kind" | "ref_id">
): number | null {
  const index = stops.findIndex(
    (stop) => stop.kind === point.kind && stop.ref_id === point.ref_id
  );

  return index < 0 ? null : index;
}

export function selectTripStop(
  selection: TripSelection,
  clickedIndex: number
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

export function getTripDistanceMeters(
  stopDistances: number[],
  boardingIndex: number | null,
  destinationIndex: number | null
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
