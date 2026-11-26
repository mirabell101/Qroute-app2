/**
 * Automatic route-point placement.
 *
 * Determines whether newly proposed points belong between existing
 * route locations, beyond the final location, or in both positions.
 * Constructs the complete proposed route sequence.
 *
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
export interface AutomaticPointPlacement {
  pointKey: string;
  placement: "insert" | "extend";
  /**
   * For an insertion:
   * Index of the original point after which this point belongs.
   *
   * For an extension:
   * Index of the original final point.
   */
  afterBasePointIndex: number;
  /**
   * Position along the relevant route segment.
   * 0 = segment beginning.
   * 1 = segment ending.
   * Values above 1 indicate extension beyond the endpoint.
   */
  fractionAlongSegment: number;
  /** Perpendicular distance from the route segment, in meters. */
  distanceFromRouteMeters: number;
}
/**
 * Kept temporarily for compatibility with the current
 * Contributions page. maxRouteOffsetMeters is no longer used.
 *
 * The previous maximum-distance restriction has been removed.
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
  /** Complete ordered sequence, including original and new points. */
  points: Array<TBase | TAddition>;
  /** Calculated placement information for every new point. */
  placements: AutomaticPointPlacement[];
}
export type AutomaticRoutePlacementFailure = {
  status: "error";
  reason:
    | "invalid_route"
    | "invalid_point"
    | "before_start"
    | "no_valid_segment";
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
// ==================================================
// INTERNAL TYPES
// ==================================================
const EARTH_RADIUS_METERS = 6_371_000;
type SegmentCandidate =
  | {
      kind: "insert";
      segmentIndex: number;
      fraction: number;
      distanceMeters: number;
    }
  | {
      kind: "extend";
      segmentIndex: number;
      fraction: number;
      distanceMeters: number;
    }
  | {
      kind: "before_start";
      segmentIndex: number;
      fraction: number;
      distanceMeters: number;
    };
interface ClassifiedPoint<T extends RoutePlacementPoint> {
  point: T;
  originalIndex: number;
  candidate: SegmentCandidate;
}
// ==================================================
// COORDINATE VALIDATION
// ==================================================
function isValidPoint(
  point: RoutePlacementPoint
): boolean {
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
// ==================================================
// GEOGRAPHIC SEGMENT PROJECTION
// ==================================================
/**
 * Projects a coordinate onto a route segment.
 *
 * Uses a local equirectangular approximation, suitable for
 * the relatively short geographic distances involved in
 * local transit routes.
 */
function projectOntoSegment(
  start: RoutePlacementPoint,
  end: RoutePlacementPoint,
  point: RoutePlacementPoint
): {
  fraction: number;
  distanceToLineMeters: number;
} | null {
  const referenceLatitude = toRadians(
    (start.latitude + end.latitude + point.latitude) / 3
  );
  const longitudeScale =
    EARTH_RADIUS_METERS * Math.cos(referenceLatitude);
  const latitudeScale = EARTH_RADIUS_METERS;
  const segmentX =
    toRadians(end.longitude - start.longitude) *
    longitudeScale;
  const segmentY =
    toRadians(end.latitude - start.latitude) *
    latitudeScale;
  const pointX =
    toRadians(point.longitude - start.longitude) *
    longitudeScale;
  const pointY =
    toRadians(point.latitude - start.latitude) *
    latitudeScale;
  const segmentLengthSquared =
    segmentX * segmentX + segmentY * segmentY;
  if (
    !Number.isFinite(segmentLengthSquared) ||
    segmentLengthSquared < 0.000001
  ) {
    return null;
  }
  const fraction =
    (pointX * segmentX + pointY * segmentY) /
    segmentLengthSquared;
  const projectedX = fraction * segmentX;
  const projectedY = fraction * segmentY;
  const distanceToLineMeters = Math.hypot(
    pointX - projectedX,
    pointY - projectedY
  );
  return {
    fraction,
    distanceToLineMeters,
  };
}
// ==================================================
// FIND THE BEST ROUTE POSITION
// ==================================================
function findBestPlacement(
  basePoints: readonly RoutePlacementPoint[],
  proposedPoint: RoutePlacementPoint
): SegmentCandidate | null {
  let best: SegmentCandidate | null = null;
  const lastSegmentIndex = basePoints.length - 2;
  for (
    let index = 0;
    index < basePoints.length - 1;
    index += 1
  ) {
    const start = basePoints[index];
    const end = basePoints[index + 1];
    if (!start || !end) continue;
    const projection = projectOntoSegment(
      start,
      end,
      proposedPoint
    );
    if (!projection) continue;
    let candidate: SegmentCandidate | null = null;
    // ------------------------------------------------
    // INTERNAL INSERTION
    // ------------------------------------------------
    if (
      projection.fraction >= 0 &&
      projection.fraction <= 1
    ) {
      candidate = {
        kind: "insert",
        segmentIndex: index,
        fraction: projection.fraction,
        distanceMeters: projection.distanceToLineMeters,
      };
    }
    // ------------------------------------------------
    // EXTENSION BEYOND THE FINAL POINT
    // ------------------------------------------------
    else if (
      index === lastSegmentIndex &&
      projection.fraction > 1
    ) {
      candidate = {
        kind: "extend",
        segmentIndex: index,
        fraction: projection.fraction,
        distanceMeters: projection.distanceToLineMeters,
      };
    }
    // ------------------------------------------------
    // PLACEMENT BEFORE THE STARTING POINT
    // ------------------------------------------------
    else if (
      index === 0 &&
      projection.fraction < 0
    ) {
      candidate = {
        kind: "before_start",
        segmentIndex: index,
        fraction: projection.fraction,
        distanceMeters: projection.distanceToLineMeters,
      };
    }
    if (!candidate) continue;
    if (
      !best ||
      candidate.distanceMeters < best.distanceMeters
    ) {
      best = candidate;
    }
  }
  return best;
}
// ==================================================
// COMPLETE AUTOMATIC ROUTE SEQUENCE
// ==================================================
export function buildAutomaticRouteSequence<
  TBase extends RoutePlacementPoint,
  TAddition extends RoutePlacementPoint,
>(
  basePoints: readonly TBase[],
  additionalPoints: readonly TAddition[],
  options?: AutomaticRoutePlacementOptions
): AutomaticRoutePlacementResult<TBase, TAddition> {
  // Retain the parameter temporarily for compatibility.
  // The distance restriction itself has been removed.
  void options;
  // ------------------------------------------------
  // 1. VALIDATE THE ORIGINAL ROUTE
  // ------------------------------------------------
  if (
    !Array.isArray(basePoints) ||
    basePoints.length < 2 ||
    basePoints.some((point) => !isValidPoint(point))
  ) {
    return {
      status: "error",
      reason: "invalid_route",
      message:
        "The selected route must contain at least two valid locations.",
    };
  }
  // ------------------------------------------------
  // 2. VALIDATE NEW LOCATIONS
  // ------------------------------------------------
  if (
    !Array.isArray(additionalPoints) ||
    additionalPoints.length < 1 ||
    additionalPoints.some((point) => !isValidPoint(point))
  ) {
    return {
      status: "error",
      reason: "invalid_point",
      message:
        "Add at least one new location with valid coordinates.",
    };
  }
  // ------------------------------------------------
  // 3. PREVENT DUPLICATE POINT KEYS
  // ------------------------------------------------
  const usedKeys = new Set(
    basePoints.map((point) => point.key)
  );
  for (const point of additionalPoints) {
    if (usedKeys.has(point.key)) {
      return {
        status: "error",
        reason: "invalid_point",
        pointKey: point.key,
        message:
          "A proposed location has already been included in the route.",
      };
    }
    usedKeys.add(point.key);
  }
  // ------------------------------------------------
  // 4. CLASSIFY EVERY NEW LOCATION
  // ------------------------------------------------
  const classified: ClassifiedPoint<TAddition>[] = [];
  for (
    let index = 0;
    index < additionalPoints.length;
    index += 1
  ) {
    const point = additionalPoints[index];
    if (!point) continue;
    const candidate = findBestPlacement(
      basePoints,
      point
    );
    if (!candidate) {
      return {
        status: "error",
        reason: "no_valid_segment",
        pointKey: point.key,
        message:
          "A valid route position could not be determined. Check that the original route has distinct, valid coordinates.",
      };
    }
    if (candidate.kind === "before_start") {
      return {
        status: "error",
        reason: "before_start",
        pointKey: point.key,
        nearestDistanceMeters: candidate.distanceMeters,
        message:
          "A new location cannot be placed before the first location of this route. Move the first route point if the route should begin elsewhere.",
      };
    }
    classified.push({
      point,
      originalIndex: index,
      candidate,
    });
  }
  // ------------------------------------------------
  // 5. ENSURE ONE SUPPORTED PROPOSAL OPERATION
  // ------------------------------------------------
  const hasInternalInsertion = classified.some(
    (item) => item.candidate.kind === "insert"
  );
  const hasExtension = classified.some(
    (item) => item.candidate.kind === "extend"
  );
  // A complete sequence can contain more than one operation. Preserve the
  // two legacy proposal types when only one operation is present, and use
  // "combined" when this one proposal contains internal insertions and an
  // extension beyond the original final point.
  const proposalType: AutomaticRouteProposalType =
    hasInternalInsertion && hasExtension
      ? "combined"
      : hasExtension
        ? "extend_route"
        : "insert_point";
  // ------------------------------------------------
  // 6. GROUP INTERNAL INSERTIONS BY ROUTE SEGMENT
  // ------------------------------------------------
  const insertionsBySegment = new Map<
    number,
    ClassifiedPoint<TAddition>[]
  >();
  const extensions: ClassifiedPoint<TAddition>[] = [];
  for (const item of classified) {
    if (item.candidate.kind === "extend") {
      extensions.push(item);
      continue;
    }
    if (item.candidate.kind !== "insert") continue;
    const segmentIndex = item.candidate.segmentIndex;
    const group =
      insertionsBySegment.get(segmentIndex) ?? [];
    group.push(item);
    insertionsBySegment.set(segmentIndex, group);
  }
  // ------------------------------------------------
  // 7. BUILD THE COMPLETE ORDERED SEQUENCE
  // ------------------------------------------------
  const orderedPoints: Array<TBase | TAddition> = [];
  for (
    let index = 0;
    index < basePoints.length - 1;
    index += 1
  ) {
    const basePoint = basePoints[index];
    if (!basePoint) continue;
    orderedPoints.push(basePoint);
    const additions = insertionsBySegment.get(index);
    if (!additions?.length) continue;
    additions.sort((a, b) => {
      const difference =
        a.candidate.fraction - b.candidate.fraction;
      return difference !== 0
        ? difference
        : a.originalIndex - b.originalIndex;
    });
    for (const addition of additions) {
      orderedPoints.push(addition.point);
    }
  }
  // Retain the original final point.
  const finalBasePoint =
    basePoints[basePoints.length - 1];
  if (!finalBasePoint) {
    return {
      status: "error",
      reason: "invalid_route",
      message:
        "The selected route's final location could not be loaded.",
    };
  }
  orderedPoints.push(finalBasePoint);
  // ------------------------------------------------
  // 8. APPEND NEW EXTENSION POINTS
  // ------------------------------------------------
  extensions.sort((a, b) => {
    const difference =
      a.candidate.fraction - b.candidate.fraction;
    return difference !== 0
      ? difference
      : a.originalIndex - b.originalIndex;
  });
  for (const extension of extensions) {
    orderedPoints.push(extension.point);
  }
  // ------------------------------------------------
  // 9. RETURN PLACEMENT INFORMATION
  // ------------------------------------------------
  const placements: AutomaticPointPlacement[] =
    classified.map((item) => ({
      pointKey: item.point.key,
      placement:
        item.candidate.kind === "extend"
          ? "extend"
          : "insert",
      afterBasePointIndex:
        item.candidate.segmentIndex,
      fractionAlongSegment:
        item.candidate.fraction,
      distanceFromRouteMeters:
        item.candidate.distanceMeters,
    }));
  return {
    status: "ready",
    proposalType,
    points: orderedPoints,
    placements,
  };
}
// ==================================================
// AUTOMATIC EXTENSION NAME
// ==================================================
/**
 * Suggests a route name using its first and final locations.
 *
 * Call this when at least one proposed point extends beyond
 * the original final route location (including combined proposals).
 */
export function suggestExtendedRouteName(
  orderedPoints: readonly RoutePlacementPoint[]
): string | null {
  if (orderedPoints.length < 2) {
    return null;
  }
  const firstPoint = orderedPoints[0];
  const lastPoint =
    orderedPoints[orderedPoints.length - 1];
  const startingName = firstPoint?.name?.trim();
  const endingName = lastPoint?.name?.trim();
  if (!startingName || !endingName) {
    return null;
  }
  return `${startingName} to ${endingName}`;
}
