
import type { RouteDetails } from "./routes";

// ============================================================
// TYPES
// ============================================================

export type Coordinates = [number, number];

export interface RouteGeometry {
  /**
   * Complete route geometry, ordered according to route stops.
   * Coordinates use [latitude, longitude].
   */
  positions: Coordinates[];

  /**
   * Cumulative road/rail distance at each ordered route stop.
   */
  stopDistances: number[];

  /**
   * Snapped map position for each ordered route stop.
   * Null means OSRM did not provide a usable waypoint.
   */
  stopMapPositions: (Coordinates | null)[];

  /**
   * Cumulative distance along the geometry's actual polyline.
   *
   * This is different from stopDistances:
   * - stopDistances uses OSRM leg distances.
   * - stopGeometryDistances locates the stop on the displayed line.
   */
  stopGeometryDistances?: (number | null)[];

  /**
   * Cumulative OSRM duration at each ordered route stop.
   * Rail routes currently have null values because no rail
   * travel-time model is supplied by the current data.
   */
  stopDurationSeconds?: (number | null)[];

  totalDistanceMeters: number | null;
  durationSeconds: number | null;
}

/**
 * Geometry and metrics for one passenger journey.
 *
 * positions are ordered from passenger origin to destination.
 */
export interface RouteGeometrySegment {
  positions: Coordinates[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  originIndex: number;
  destinationIndex: number;
}

// ============================================================
// GEOMETRY KEY
// ============================================================

export function getRouteGeometryKey(
  positions: Coordinates[],
): string {
  const forward = JSON.stringify(positions);

  const reverse = JSON.stringify(
    [...positions].reverse(),
  );

  return forward < reverse
    ? forward
    : reverse;
}

// ============================================================
// OSRM RESPONSE
// ============================================================

interface OSRMResponse {
  code: string;
  message?: string;

  routes?: {
    distance: number;
    duration: number;

    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };

    legs?: {
      distance: number;
      duration: number;
    }[];
  }[];

  waypoints?: (
    | {
        location?: [number, number] | null;
      }
    | null
  )[];
}

// ============================================================
// DISTANCE HELPERS
// ============================================================

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(
  from: Coordinates,
  to: Coordinates,
): number {
  const earthRadius = 6371000;

  const dLat = toRadians(to[0] - from[0]);
  const dLng = toRadians(to[1] - from[1]);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from[0])) *
      Math.cos(toRadians(to[0])) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return (
    earthRadius *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )
  );
}

function isValidCoordinate(
  value: unknown,
): value is Coordinates {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -90 &&
    value[0] <= 90 &&
    value[1] >= -180 &&
    value[1] <= 180
  );
}

// ============================================================
// EMPTY GEOMETRY
// ============================================================

function emptyRouteGeometry(): RouteGeometry {
  return {
    positions: [],
    stopDistances: [],
    stopMapPositions: [],
    stopGeometryDistances: [],
    stopDurationSeconds: [],
    totalDistanceMeters: null,
    durationSeconds: null,
  };
}

// ============================================================
// CUMULATIVE POLYLINE DISTANCES
// ============================================================

/**
 * Calculates cumulative geographic distance along a polyline.
 *
 * The returned array has the same length as positions.
 *
 * Example:
 * positions: [A, B, C]
 * result:    [0, distance(A,B), distance(A,B)+distance(B,C)]
 */
function getCumulativeGeometryDistances(
  positions: Coordinates[],
): number[] {
  if (positions.length === 0) {
    return [];
  }

  const cumulative: number[] = [0];

  for (
    let index = 1;
    index < positions.length;
    index += 1
  ) {
    cumulative.push(
      cumulative[index - 1] +
        getDistanceMeters(
          positions[index - 1],
          positions[index],
        ),
    );
  }

  return cumulative;
}

// ============================================================
// PROJECT A WAYPOINT ONTO A POLYLINE
// ============================================================

interface LineProjection {
  coordinate: Coordinates;
  offsetMeters: number;
  distanceMeters: number;
}

/**
 * Projects a waypoint onto the nearest eligible section of
 * a polyline.
 *
 * minimumOffset prevents a later route stop from being matched
 * to an earlier part of the route. This is useful when a route
 * passes near the same location more than once.
 */
function projectPointOntoPolyline(
  positions: Coordinates[],
  point: Coordinates,
  minimumOffset = 0,
): LineProjection | null {
  if (
    positions.length < 2 ||
    !isValidCoordinate(point) ||
    !Number.isFinite(minimumOffset) ||
    minimumOffset < 0
  ) {
    return null;
  }

  let cumulative = 0;
  let best: LineProjection | null = null;

  for (
    let index = 0;
    index < positions.length - 1;
    index += 1
  ) {
    const start = positions[index];
    const end = positions[index + 1];

    const segmentLength = getDistanceMeters(
      start,
      end,
    );

    if (
      !Number.isFinite(segmentLength) ||
      segmentLength <= 0
    ) {
      continue;
    }

    const segmentEndOffset =
      cumulative + segmentLength;

    // This entire segment is before the allowed position.
    if (
      segmentEndOffset <
      minimumOffset - 0.01
    ) {
      cumulative = segmentEndOffset;
      continue;
    }

    // Restrict projection to the portion at or after
    // the previously matched stop.
    const minimumT = Math.max(
      0,
      Math.min(
        1,
        (minimumOffset - cumulative) /
          segmentLength,
      ),
    );

    // Local equirectangular projection is sufficient for
    // calculating a nearest point on a city-scale road segment.
    const meanLatitude = toRadians(
      (start[0] + end[0] + point[0]) / 3,
    );

    const longitudeScale = Math.max(
      0.000001,
      Math.abs(Math.cos(meanLatitude)),
    );

    const segmentX =
      (end[1] - start[1]) *
      longitudeScale;

    const segmentY =
      end[0] - start[0];

    const pointX =
      (point[1] - start[1]) *
      longitudeScale;

    const pointY =
      point[0] - start[0];

    const denominator =
      segmentX * segmentX +
      segmentY * segmentY;

    const rawT =
      denominator > 0
        ? (
            pointX * segmentX +
            pointY * segmentY
          ) / denominator
        : minimumT;

    const t = Math.max(
      minimumT,
      Math.min(1, rawT),
    );

    const projected: Coordinates = [
      start[0] + t * (end[0] - start[0]),
      start[1] + t * (end[1] - start[1]),
    ];

    const distanceMeters = getDistanceMeters(
      point,
      projected,
    );

    const offsetMeters =
      cumulative + segmentLength * t;

    const candidate: LineProjection = {
      coordinate: projected,
      offsetMeters,
      distanceMeters,
    };

    if (
      best === null ||
      candidate.distanceMeters <
        best.distanceMeters - 0.01 ||
      (
        Math.abs(
          candidate.distanceMeters -
            best.distanceMeters,
        ) <= 0.01 &&
        candidate.offsetMeters <
          best.offsetMeters
      )
    ) {
      best = candidate;
    }

    cumulative = segmentEndOffset;
  }

  return best;
}

// ============================================================
// MATCH SNAPPED STOPS TO ROUTE GEOMETRY
// ============================================================

/**
 * Locates every snapped route stop along the complete route line.
 *
 * The output follows route-stop order and uses cumulative
 * geometry distance, not stop order numbers or raw coordinates.
 */
function getStopGeometryDistances(
  positions: Coordinates[],
  stopMapPositions: (Coordinates | null)[],
): (number | null)[] {
  if (positions.length < 2) {
    return stopMapPositions.map(() => null);
  }

  let previousOffset = 0;

  return stopMapPositions.map((waypoint) => {
    if (
      waypoint === null ||
      !isValidCoordinate(waypoint)
    ) {
      return null;
    }

    const projection = projectPointOntoPolyline(
      positions,
      waypoint,
      previousOffset,
    );

    if (!projection) {
      return null;
    }

    previousOffset = projection.offsetMeters;

    return projection.offsetMeters;
  });
}

// ============================================================
// CUMULATIVE OSRM LEG VALUES
// ============================================================

function getCumulativeLegValues(
  legs: {
    distance: number;
    duration: number;
  }[],
  stopCount: number,
  field: "distance" | "duration",
): (number | null)[] {
  if (
    !Number.isInteger(stopCount) ||
    stopCount < 2 ||
    legs.length !== stopCount - 1
  ) {
    return Array.from(
      { length: Math.max(0, stopCount) },
      () => null,
    );
  }

  const validLegs = legs.every((leg) => {
    const value = leg[field];

    return (
      Number.isFinite(value) &&
      value >= 0
    );
  });

  if (!validLegs) {
    return Array.from(
      { length: stopCount },
      () => null,
    );
  }

  const cumulative: (number | null)[] = [0];

  legs.forEach((leg, index) => {
    cumulative.push(
      (cumulative[index] ?? 0) +
        leg[field],
    );
  });

  return cumulative;
}

// ============================================================
// RAIL GEOMETRY
// ============================================================

function getRailGeometry(
  route: RouteDetails,
): RouteGeometry {
  const positions = route.route_stops.map(
    (stop): Coordinates => [
      stop.latitude,
      stop.longitude,
    ],
  );

  const stopDistances: number[] = [0];

  for (
    let index = 1;
    index < positions.length;
    index += 1
  ) {
    stopDistances.push(
      stopDistances[index - 1] +
        getDistanceMeters(
          positions[index - 1],
          positions[index],
        ),
    );
  }

  return {
    positions,
    stopDistances,
    stopMapPositions: positions,
    stopGeometryDistances: stopDistances,
    stopDurationSeconds: positions.map(
      () => null,
    ),
    totalDistanceMeters:
      stopDistances[stopDistances.length - 1] ?? 0,
    durationSeconds: null,
  };
}

// ============================================================
// LOAD COMPLETE ROUTE GEOMETRY
// ============================================================

export async function getRouteGeometry(
  route: RouteDetails,
  signal?: AbortSignal,
): Promise<RouteGeometry> {
  const stops = [...route.route_stops].sort(
    (left, right) =>
      left.stop_order - right.stop_order,
  );

  if (stops.length < 2) {
    return emptyRouteGeometry();
  }

  const orderedRoute = {
    ...route,
    route_stops: stops,
  };

  // Rail geometry follows the ordered stations directly.
  if (
    route.transport_variants.fare_model ===
    "matrix"
  ) {
    return getRailGeometry(orderedRoute);
  }

  const waypoints = stops
    .map(
      (stop) =>
        `${stop.longitude},${stop.latitude}`,
    )
    .join(";");

  const url =
    `https://router.project-osrm.org/route/v1/driving/${waypoints}` +
    "?overview=full&geometries=geojson&steps=false";

  const response = await fetch(
    url,
    signal ? { signal } : undefined,
  );

  if (!response.ok) {
    throw new Error(
      `Routing service returned HTTP ${response.status}.`,
    );
  }

  const result: OSRMResponse =
    await response.json();

  if (
    result.code !== "Ok" ||
    !result.routes?.length
  ) {
    throw new Error(
      result.message ||
        "No road route could be found.",
    );
  }

  const routeResult = result.routes[0];

  if (
    routeResult.geometry.type !== "LineString" ||
    routeResult.geometry.coordinates.length < 2
  ) {
    throw new Error(
      "Road routing returned no usable route geometry.",
    );
  }

  // OSRM gives [longitude, latitude].
  // The application uses [latitude, longitude].
  const positions = routeResult.geometry.coordinates.map(
    ([longitude, latitude]): Coordinates => [
      latitude,
      longitude,
    ],
  );

  const stopMapPositions = stops.map(
    (_, index): Coordinates | null => {
      const location =
        result.waypoints?.[index]?.location;

      if (
        Array.isArray(location) &&
        location.length === 2 &&
        location.every(Number.isFinite)
      ) {
        return [
          location[1],
          location[0],
        ];
      }

      return null;
    },
  );

  const legs = routeResult.legs ?? [];

  const stopGeometryDistances =
    getStopGeometryDistances(
      positions,
      stopMapPositions,
    );

  const stopDistances = getCumulativeLegValues(
    legs,
    stops.length,
    "distance",
  );

  const stopDurationSeconds =
    getCumulativeLegValues(
      legs,
      stops.length,
      "duration",
    );

  const hasCompleteWaypoints =
    Array.isArray(result.waypoints) &&
    result.waypoints.length === stops.length &&
    result.waypoints.every((waypoint) => {
      const location = waypoint?.location;

      return (
        Array.isArray(location) &&
        location.length === 2 &&
        location.every(Number.isFinite)
      );
    });

  const hasCompleteLegDistances =
    legs.length === stops.length - 1 &&
    legs.every(
      (leg) =>
        Number.isFinite(leg.distance) &&
        leg.distance >= 0,
    );

  if (
    !hasCompleteWaypoints ||
    !hasCompleteLegDistances
  ) {
    return {
      positions,
      stopDistances: [],
      stopMapPositions,
      stopGeometryDistances,
      stopDurationSeconds,
      totalDistanceMeters: null,
      durationSeconds: Number.isFinite(
        routeResult.duration,
      )
        ? routeResult.duration
        : null,
    };
  }

  const validStopDistances =
    stopDistances.every(
      (value) =>
        value !== null &&
        Number.isFinite(value),
    );

  return {
    positions,

    stopDistances: validStopDistances
      ? stopDistances as number[]
      : [],

    stopMapPositions,
    stopGeometryDistances,
    stopDurationSeconds,

    totalDistanceMeters:
      validStopDistances
        ? stopDistances[stopDistances.length - 1]
        : null,

    durationSeconds: Number.isFinite(
      routeResult.duration,
    )
      ? routeResult.duration
      : null,
  };
}

// ============================================================
// GET A COORDINATE AT A POLYLINE OFFSET
// ============================================================

function getCoordinateAtDistance(
  positions: Coordinates[],
  cumulativeDistances: number[],
  targetDistance: number,
): Coordinates | null {
  if (
    positions.length < 2 ||
    cumulativeDistances.length !== positions.length ||
    !Number.isFinite(targetDistance)
  ) {
    return null;
  }

  if (targetDistance <= 0) {
    return positions[0];
  }

  const totalDistance =
    cumulativeDistances[
      cumulativeDistances.length - 1
    ];

  if (targetDistance >= totalDistance) {
    return positions[positions.length - 1];
  }

  for (
    let index = 0;
    index < positions.length - 1;
    index += 1
  ) {
    const startDistance =
      cumulativeDistances[index];

    const endDistance =
      cumulativeDistances[index + 1];

    if (
      targetDistance < startDistance ||
      targetDistance > endDistance
    ) {
      continue;
    }

    const segmentDistance =
      endDistance - startDistance;

    if (segmentDistance <= 0) {
      return positions[index];
    }

    const ratio =
      (targetDistance - startDistance) /
      segmentDistance;

    return [
      positions[index][0] +
        ratio *
          (
            positions[index + 1][0] -
            positions[index][0]
          ),

      positions[index][1] +
        ratio *
          (
            positions[index + 1][1] -
            positions[index][1]
          ),
    ];
  }

  return null;
}

// ============================================================
// EXTRACT A SECTION OF A COMPLETE ROUTE POLYLINE
// ============================================================

function extractPolylineSegment(
  positions: Coordinates[],
  cumulativeDistances: number[],
  startDistance: number,
  endDistance: number,
): Coordinates[] | null {
  if (
    positions.length < 2 ||
    cumulativeDistances.length !== positions.length ||
    !Number.isFinite(startDistance) ||
    !Number.isFinite(endDistance) ||
    endDistance - startDistance < 0.01
  ) {
    return null;
  }

  const start = getCoordinateAtDistance(
    positions,
    cumulativeDistances,
    startDistance,
  );

  const end = getCoordinateAtDistance(
    positions,
    cumulativeDistances,
    endDistance,
  );

  if (!start || !end) {
    return null;
  }

  const segment: Coordinates[] = [start];

  for (
    let index = 1;
    index < positions.length - 1;
    index += 1
  ) {
    const offset = cumulativeDistances[index];

    if (
      offset > startDistance + 0.01 &&
      offset < endDistance - 0.01
    ) {
      segment.push(positions[index]);
    }
  }

  segment.push(end);

  // Remove adjacent duplicate coordinates.
  const uniqueSegment = segment.filter(
    (coordinate, index, all) => {
      if (index === 0) {
        return true;
      }

      return (
        getDistanceMeters(
          all[index - 1],
          coordinate,
        ) > 0.01
      );
    },
  );

  return uniqueSegment.length >= 2
    ? uniqueSegment
    : null;
}

// ============================================================
// GET A PASSENGER JOURNEY SEGMENT
// ============================================================

/**
 * Extracts the geometry between two ordered route stops.
 *
 * The complete OSRM geometry is reused. No additional OSRM
 * request is made and no second route is calculated.
 *
 * If the passenger travels in reverse route order, the
 * returned coordinates are reversed to follow the journey.
 */
export function getRouteGeometrySegment(
  geometry: RouteGeometry | null | undefined,
  originIndex: number,
  destinationIndex: number,
): RouteGeometrySegment | null {
  if (
    !geometry ||
    geometry.positions.length < 2 ||
    !Number.isInteger(originIndex) ||
    !Number.isInteger(destinationIndex) ||
    originIndex < 0 ||
    destinationIndex < 0 ||
    originIndex === destinationIndex
  ) {
    return null;
  }

  if (
    originIndex >= geometry.stopMapPositions.length ||
    destinationIndex >= geometry.stopMapPositions.length
  ) {
    return null;
  }

  const geometryOffsets =
    geometry.stopGeometryDistances?.length ===
    geometry.stopMapPositions.length
      ? geometry.stopGeometryDistances
      : getStopGeometryDistances(
          geometry.positions,
          geometry.stopMapPositions,
        );

  const originOffset =
    geometryOffsets[originIndex];

  const destinationOffset =
    geometryOffsets[destinationIndex];

  if (
    originOffset === null ||
    destinationOffset === null ||
    !Number.isFinite(originOffset) ||
    !Number.isFinite(destinationOffset)
  ) {
    return null;
  }

  const startDistance = Math.min(
    originOffset,
    destinationOffset,
  );

  const endDistance = Math.max(
    originOffset,
    destinationOffset,
  );

  const cumulativeGeometryDistances =
    getCumulativeGeometryDistances(
      geometry.positions,
    );

  let positions = extractPolylineSegment(
    geometry.positions,
    cumulativeGeometryDistances,
    startDistance,
    endDistance,
  );

  if (!positions) {
    return null;
  }

  // The route geometry follows route-stop order.
  // Reverse it when the passenger travels in the opposite direction.
  if (originOffset > destinationOffset) {
    positions = [...positions].reverse();
  }

  // Network distance comes from OSRM leg distances.
  const originDistance =
    geometry.stopDistances[originIndex];

  const destinationDistance =
    geometry.stopDistances[destinationIndex];

  const distanceMeters =
    Number.isFinite(originDistance) &&
    Number.isFinite(destinationDistance)
      ? Math.abs(
          (destinationDistance as number) -
            (originDistance as number),
        )
      : null;

  // Estimated road travel time comes from OSRM leg durations.
  // Rail durations remain null until a timetable model exists.
  const originDuration =
    geometry.stopDurationSeconds?.[originIndex];

  const destinationDuration =
    geometry.stopDurationSeconds?.[destinationIndex];

  const durationSeconds =
    originDuration !== null &&
    originDuration !== undefined &&
    destinationDuration !== null &&
    destinationDuration !== undefined &&
    Number.isFinite(originDuration) &&
    Number.isFinite(destinationDuration)
      ? Math.abs(
          destinationDuration - originDuration,
        )
      : null;

  return {
    positions,
    distanceMeters,
    durationSeconds,
    originIndex,
    destinationIndex,
  };
}
