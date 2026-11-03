import type { RouteDetails } from "./routes";

export type Coordinates = [number, number];

export interface RouteGeometry {
  positions: Coordinates[];
  stopDistances: number[];
  stopMapPositions: (Coordinates | null)[];
  totalDistanceMeters: number | null;
  durationSeconds: number | null;
}

export function getRouteGeometryKey(positions: Coordinates[]): string {
  const forward = JSON.stringify(positions);
  const reverse = JSON.stringify([...positions].reverse());

  return forward < reverse ? forward : reverse;
}

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
    legs?: { distance: number }[];
  }[];
  waypoints?: ({ location?: [number, number] | null } | null)[];
}

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

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emptyRouteGeometry(): RouteGeometry {
  return {
    positions: [],
    stopDistances: [],
    stopMapPositions: [],
    totalDistanceMeters: null,
    durationSeconds: null,
  };
}

function getRailGeometry(route: RouteDetails): RouteGeometry {
  const positions = route.route_stops.map(
    (stop): Coordinates => [stop.latitude, stop.longitude]
  );
  const stopDistances: number[] = [0];

  for (let index = 1; index < positions.length; index += 1) {
    stopDistances.push(
      stopDistances[index - 1] +
        getDistanceMeters(positions[index - 1], positions[index])
    );
  }

  return {
    positions,
    stopDistances,
    stopMapPositions: positions,
    totalDistanceMeters: stopDistances[stopDistances.length - 1],
    durationSeconds: null,
  };
}

export async function getRouteGeometry(
  route: RouteDetails,
  signal?: AbortSignal
): Promise<RouteGeometry> {
  const stops = [...route.route_stops].sort(
    (left, right) => left.stop_order - right.stop_order
  );

  if (stops.length < 2) return emptyRouteGeometry();

  const orderedRoute = { ...route, route_stops: stops };
  if (route.transport_variants.fare_model === "matrix") {
    return getRailGeometry(orderedRoute);
  }

  const waypoints = stops
    .map((stop) => `${stop.longitude},${stop.latitude}`)
    .join(";");
  const url =
    `https://router.project-osrm.org/route/v1/driving/${waypoints}` +
    "?overview=full&geometries=geojson&steps=false";
  const response = await fetch(url, signal ? { signal } : undefined);

  if (!response.ok) {
    throw new Error(`Routing service returned HTTP ${response.status}.`);
  }

  const result: OSRMResponse = await response.json();
  if (result.code !== "Ok" || !result.routes?.length) {
    throw new Error(result.message || "No road route could be found.");
  }

  const routeResult = result.routes[0];
  if (
    routeResult.geometry.type !== "LineString" ||
    routeResult.geometry.coordinates.length < 2
  ) {
    throw new Error("Road routing returned no usable route geometry.");
  }

  const positions = routeResult.geometry.coordinates.map(
    ([longitude, latitude]): Coordinates => [latitude, longitude]
  );
  const stopMapPositions = stops.map((_, index) => {
    const location = result.waypoints?.[index]?.location;
    return (
      Array.isArray(location) &&
      location.length === 2 &&
      location.every(Number.isFinite)
    )
      ? ([location[1], location[0]] as Coordinates)
      : null;
  });
  const legs = routeResult.legs ?? [];
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
      (leg) => Number.isFinite(leg.distance) && leg.distance >= 0
    );

  if (!hasCompleteWaypoints || !hasCompleteLegDistances) {
    return {
      positions,
      stopDistances: [],
      stopMapPositions,
      totalDistanceMeters: null,
      durationSeconds: Number.isFinite(routeResult.duration)
        ? routeResult.duration
        : null,
    };
  }

  const stopDistances: number[] = [0];
  legs.forEach((leg, index) => {
    stopDistances.push(stopDistances[index] + leg.distance);
  });

  return {
    positions,
    stopDistances,
    stopMapPositions,
    totalDistanceMeters: stopDistances[stopDistances.length - 1],
    durationSeconds: Number.isFinite(routeResult.duration)
      ? routeResult.duration
      : null,
  };
}
