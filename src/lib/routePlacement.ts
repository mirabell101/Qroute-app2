/**
 * Automatic route-point placement.
 *
 * Classifies additions as front extensions, middle insertions, or back
 * extensions and constructs the complete proposed route sequence.
 * This file does not modify Supabase data.
 */
export interface RoutePlacementPoint {
  key: string;
  latitude: number;
  longitude: number;
  name?: string;
}

export type AutomaticRouteProposalType =
  | "insert_point"
  | "extend_route"
  | "combined"
  | "remove_points";

export type RouteSequencePosition = "front" | "middle" | "back";

export interface AutomaticPointPlacement {
  pointKey: string;
  /** Legacy classification retained for existing consumers. */
  placement: "insert" | "extend";
  /** Actual position in the proposed route sequence. */
  position: RouteSequencePosition;
  /** Index of the original segment relevant to this placement. */
  afterBasePointIndex: number;
  /** Position along the relevant route segment. */
  fractionAlongSegment: number;
  /** Perpendicular distance from the route segment, in meters. */
  distanceFromRouteMeters: number;
}

/**
 * Kept for compatibility with existing callers. The option is no longer
 * used to reject points based on their distance from the route.
 */
export interface AutomaticRoutePlacementOptions {
  maxRouteOffsetMeters?: number;
}

export interface AutomaticRoutePlacementSuccess<
  TBase extends RoutePlacementPoint,
  TAddition extends RoutePlacementPoint,
> {
  status: "ready";
  proposalType: AutomaticRouteProposalType;
  points: Array<TBase | TAddition>;
  placements: AutomaticPointPlacement[];
}

export type AutomaticRoutePlacementFailure = {
  status: "error";
  reason: "invalid_route" | "invalid_point" | "before_start" | "no_valid_segment";
  message: string;
  pointKey?: string;
  nearestDistanceMeters?: number;
};

export type AutomaticRoutePlacementResult<
  TBase extends RoutePlacementPoint,
  TAddition extends RoutePlacementPoint,
> =
  | AutomaticRoutePlacementSuccess<TBase, TAddition>
  | AutomaticRoutePlacementFailure;

const EARTH_RADIUS_METERS = 6_371_000;

type SegmentCandidate =
  | { kind: "insert"; segmentIndex: number; fraction: number; distanceMeters: number }
  | { kind: "extend"; segmentIndex: number; fraction: number; distanceMeters: number }
  | { kind: "before_start"; segmentIndex: number; fraction: number; distanceMeters: number };

interface ClassifiedPoint<T extends RoutePlacementPoint> {
  point: T;
  originalIndex: number;
  candidate: SegmentCandidate;
}

function isValidPoint(point: RoutePlacementPoint): boolean {
  return (
    typeof point.key === "string" &&
    point.key.trim().length > 0 &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Projects a coordinate onto a short local route segment. */
function projectOntoSegment(
  start: RoutePlacementPoint,
  end: RoutePlacementPoint,
  point: RoutePlacementPoint,
): { fraction: number; distanceToLineMeters: number } | null {
  const referenceLatitude = toRadians(
    (start.latitude + end.latitude + point.latitude) / 3,
  );
  const longitudeScale = EARTH_RADIUS_METERS * Math.cos(referenceLatitude);
  const latitudeScale = EARTH_RADIUS_METERS;
  const segmentX = toRadians(end.longitude - start.longitude) * longitudeScale;
  const segmentY = toRadians(end.latitude - start.latitude) * latitudeScale;
  const pointX = toRadians(point.longitude - start.longitude) * longitudeScale;
  const pointY = toRadians(point.latitude - start.latitude) * latitudeScale;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (!Number.isFinite(segmentLengthSquared) || segmentLengthSquared < 0.000001) {
    return null;
  }

  const fraction = (pointX * segmentX + pointY * segmentY) / segmentLengthSquared;
  const projectedX = fraction * segmentX;
  const projectedY = fraction * segmentY;

  return {
    fraction,
    distanceToLineMeters: Math.hypot(pointX - projectedX, pointY - projectedY),
  };
}

function findBestPlacement(
  basePoints: readonly RoutePlacementPoint[],
  proposedPoint: RoutePlacementPoint,
): SegmentCandidate | null {
  let best: SegmentCandidate | null = null;
  const lastSegmentIndex = basePoints.length - 2;

  for (let index = 0; index < basePoints.length - 1; index += 1) {
    const start = basePoints[index];
    const end = basePoints[index + 1];
    if (!start || !end) continue;

    const projection = projectOntoSegment(start, end, proposedPoint);
    if (!projection) continue;

    let candidate: SegmentCandidate | null = null;

    if (projection.fraction >= 0 && projection.fraction <= 1) {
      candidate = {
        kind: "insert",
        segmentIndex: index,
        fraction: projection.fraction,
        distanceMeters: projection.distanceToLineMeters,
      };
    } else if (index === lastSegmentIndex && projection.fraction > 1) {
      candidate = {
        kind: "extend",
        segmentIndex: index,
        fraction: projection.fraction,
        distanceMeters: projection.distanceToLineMeters,
      };
    } else if (index === 0 && projection.fraction < 0) {
      candidate = {
        kind: "before_start",
        segmentIndex: index,
        fraction: projection.fraction,
        distanceMeters: projection.distanceToLineMeters,
      };
    }

    if (candidate && (!best || candidate.distanceMeters < best.distanceMeters)) {
      best = candidate;
    }
  }

  return best;
}

export function buildAutomaticRouteSequence<
  TBase extends RoutePlacementPoint,
  TAddition extends RoutePlacementPoint,
>(
  basePoints: readonly TBase[],
  additionalPoints: readonly TAddition[],
  options?: AutomaticRoutePlacementOptions,
): AutomaticRoutePlacementResult<TBase, TAddition> {
  void options;

  if (
    !Array.isArray(basePoints) ||
    basePoints.length < 2 ||
    basePoints.some((point) => !isValidPoint(point))
  ) {
    return {
      status: "error",
      reason: "invalid_route",
      message: "The selected route must contain at least two valid locations.",
    };
  }

  if (
    !Array.isArray(additionalPoints) ||
    additionalPoints.length < 1 ||
    additionalPoints.some((point) => !isValidPoint(point))
  ) {
    return {
      status: "error",
      reason: "invalid_point",
      message: "Add at least one new location with valid coordinates.",
    };
  }

  const usedKeys = new Set(basePoints.map((point) => point.key));
  for (const point of additionalPoints) {
    if (usedKeys.has(point.key)) {
      return {
        status: "error",
        reason: "invalid_point",
        pointKey: point.key,
        message: "A proposed location has already been included in the route.",
      };
    }
    usedKeys.add(point.key);
  }

  const classified: ClassifiedPoint<TAddition>[] = [];
  for (let index = 0; index < additionalPoints.length; index += 1) {
    const point = additionalPoints[index];
    if (!point) continue;

    const candidate = findBestPlacement(basePoints, point);
    if (!candidate) {
      return {
        status: "error",
        reason: "no_valid_segment",
        pointKey: point.key,
        message:
          "A valid route position could not be determined. Check that the original route has distinct, valid coordinates.",
      };
    }

    // Points projected before the first route segment are now valid front
    // extensions. Their final order is calculated below.
    classified.push({ point, originalIndex: index, candidate });
  }

  const hasInternalInsertion = classified.some((item) => item.candidate.kind === "insert");
  const hasFrontExtension = classified.some((item) => item.candidate.kind === "before_start");
  const hasBackExtension = classified.some((item) => item.candidate.kind === "extend");

  // Preserve the existing DB contract. A middle + back proposal remains
  // "combined". When a front extension is also present, "insert_point" is
  // used if there is an internal insertion; its DB validator checks the
  // middle insertion while accepting the complete leading/trailing sequence.
  const proposalType: AutomaticRouteProposalType =
    hasInternalInsertion && hasBackExtension && !hasFrontExtension
      ? "combined"
      : hasInternalInsertion
        ? "insert_point"
        : "extend_route";

  const frontExtensions: ClassifiedPoint<TAddition>[] = [];
  const insertionsBySegment = new Map<number, ClassifiedPoint<TAddition>[]>();
  const backExtensions: ClassifiedPoint<TAddition>[] = [];

  for (const item of classified) {
    if (item.candidate.kind === "before_start") {
      frontExtensions.push(item);
    } else if (item.candidate.kind === "extend") {
      backExtensions.push(item);
    } else {
      const segmentIndex = item.candidate.segmentIndex;
      const group = insertionsBySegment.get(segmentIndex) ?? [];
      group.push(item);
      insertionsBySegment.set(segmentIndex, group);
    }
  }

  const byAlongSegment = (
    left: ClassifiedPoint<TAddition>,
    right: ClassifiedPoint<TAddition>,
  ) => {
    const difference = left.candidate.fraction - right.candidate.fraction;
    return difference !== 0 ? difference : left.originalIndex - right.originalIndex;
  };

  // For front extensions, the most distant point from the existing start
  // comes first (e.g. fraction -0.8 before -0.2).
  frontExtensions.sort(byAlongSegment);
  backExtensions.sort(byAlongSegment);

  const orderedPoints: Array<TBase | TAddition> = [
    ...frontExtensions.map((item) => item.point),
  ];

  for (let index = 0; index < basePoints.length - 1; index += 1) {
    const basePoint = basePoints[index];
    if (!basePoint) continue;

    orderedPoints.push(basePoint);
    const additions = insertionsBySegment.get(index);
    if (!additions?.length) continue;

    additions.sort(byAlongSegment);
    for (const addition of additions) orderedPoints.push(addition.point);
  }

  const finalBasePoint = basePoints[basePoints.length - 1];
  if (!finalBasePoint) {
    return {
      status: "error",
      reason: "invalid_route",
      message: "The selected route's final location could not be loaded.",
    };
  }

  orderedPoints.push(finalBasePoint);
  orderedPoints.push(...backExtensions.map((item) => item.point));

  const placements: AutomaticPointPlacement[] = classified.map((item) => ({
    pointKey: item.point.key,
    placement: item.candidate.kind === "insert" ? "insert" : "extend",
    position:
      item.candidate.kind === "before_start"
        ? "front"
        : item.candidate.kind === "extend"
          ? "back"
          : "middle",
    afterBasePointIndex: item.candidate.segmentIndex,
    fractionAlongSegment: item.candidate.fraction,
    distanceFromRouteMeters: item.candidate.distanceMeters,
  }));

  return { status: "ready", proposalType, points: orderedPoints, placements };
}

/** Suggest a route name from the proposed first and final locations. */
export function suggestExtendedRouteName(
  orderedPoints: readonly RoutePlacementPoint[],
): string | null {
  if (orderedPoints.length < 2) return null;

  const firstPoint = orderedPoints[0];
  const lastPoint = orderedPoints[orderedPoints.length - 1];
  const startingName = firstPoint?.name?.trim();
  const endingName = lastPoint?.name?.trim();

  if (!startingName || !endingName) return null;
  return `${startingName} to ${endingName}`;
}
