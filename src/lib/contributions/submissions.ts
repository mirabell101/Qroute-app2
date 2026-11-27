import { supabase } from "@/lib/supabase";
import { isPositiveSafeInteger, isRecord } from "./helpers";
import type {
  ContributionInput,
  PointInput,
  PointKind,
  RouteChangePointInput,
  RouteChangeProposalInput,
  RouteChangeProposalSubmitResult,
  RouteChangeProposalType,
  RouteChangeSubmitPoint,
  SubmitResult,
} from "./types";

// ==================================================
// NORMAL CONTRIBUTION RESPONSE VALIDATION
// ==================================================
function isSubmitPoint(
  value: unknown,
): value is { kind: PointKind; id: number } {
  return (
    isRecord(value) &&
    (value.kind === "terminal" || value.kind === "stop") &&
    isPositiveSafeInteger(value.id)
  );
}

function isSubmitResult(
  value: unknown,
): value is {
  route_id: number | null;
  points: { kind: PointKind; id: number }[];
  moderation_status: "pending" | "approved";
} {
  return (
    isRecord(value) &&
    (value.route_id === null || isPositiveSafeInteger(value.route_id)) &&
    (value.moderation_status === "pending" || value.moderation_status === "approved") &&
    Array.isArray(value.points) &&
    value.points.every(isSubmitPoint)
  );
}

// ==================================================
// ROUTE-CHANGE PROPOSAL RESPONSE VALIDATION
// ==================================================
function isRouteChangeSubmitPoint(
  value: unknown,
): value is { kind: PointKind; id: number; is_new_point: boolean } {
  return (
    isRecord(value) &&
    (value.kind === "terminal" || value.kind === "stop") &&
    isPositiveSafeInteger(value.id) &&
    typeof value.is_new_point === "boolean"
  );
}

function isRouteChangeProposalSubmitResult(
  value: unknown,
): value is {
  proposal_id: number;
  route_id: number;
  proposal_type: RouteChangeProposalType;
  moderation_status: "pending";
  point_count: number;
  created_point_count: number;
  points: { kind: PointKind; id: number; is_new_point: boolean }[];
} {
  return (
    isRecord(value) &&
    isPositiveSafeInteger(value.proposal_id) &&
    isPositiveSafeInteger(value.route_id) &&
    (value.proposal_type === "insert_point" ||
      value.proposal_type === "extend_route" ||
      value.proposal_type === "combined" ||
      value.proposal_type === "remove_points") &&
    value.moderation_status === "pending" &&
    typeof value.point_count === "number" &&
    Number.isSafeInteger(value.point_count) &&
    value.point_count >= 2 &&
    typeof value.created_point_count === "number" &&
    Number.isSafeInteger(value.created_point_count) &&
    value.created_point_count >= 0 &&
    (value.proposal_type === "remove_points"
      ? value.created_point_count === 0
      : value.created_point_count >= 1) &&
    Array.isArray(value.points) &&
    value.points.every(isRouteChangeSubmitPoint) &&
    value.points.length === value.point_count
  );
}

// ==================================================
// NORMAL CONTRIBUTION SUBMISSION
// ==================================================
const pointPayload = (point: PointInput) => ({
  kind: point.kind,
  existing_id: point.existingId ?? null,
  transport_type_id: point.transportTypeId ?? null,
  name: point.name.trim(),
  description: point.description.trim(),
  stop_type: point.stopType,
  latitude: point.latitude,
  longitude: point.longitude,
});

/**
 * Submits a standalone terminal/stop or a completely new route.
 * Existing-route modifications must use the route-change proposal service.
 */
export async function submitContribution(input: ContributionInput): Promise<SubmitResult> {
  const payload =
    input.kind === "route"
      ? {
          name: input.name.trim(),
          variant_id: input.variantId,
          points: input.points.map(pointPayload),
        }
      : pointPayload(input);

  const { data, error } = await supabase.rpc("submit_contribution", {
    p_kind: input.kind,
    p_payload: payload,
  });

  if (error) throw new Error(error.message);
  if (!isSubmitResult(data)) {
    throw new Error("Contribution service returned an invalid response.");
  }

  return {
    routeId: data.route_id,
    points: data.points,
    moderationStatus: data.moderation_status,
  };
}

// ==================================================
// ROUTE-CHANGE PROPOSAL SUBMISSION
// ==================================================
/**
 * Serializes route-change locations for public.submit_route_change_proposal().
 * The database derives a new terminal's transport_type_id from the selected
 * route. Do not send transport_type_id here: the SQL RPC rejects extra keys
 * and is authoritative for route/terminal vehicle compatibility.
 */
function routeChangePointPayload(point: RouteChangePointInput): Record<string, unknown> {
  if (point.existingId !== null) {
    return { kind: point.kind, existing_id: point.existingId };
  }

  if (point.kind === "terminal") {
    return {
      kind: "terminal",
      existing_id: null,
      name: point.name.trim(),
      latitude: point.latitude,
      longitude: point.longitude,
    };
  }

  return {
    kind: "stop",
    existing_id: null,
    name: point.name.trim(),
    description: (point.description ?? "").trim(),
    stop_type: point.stopType,
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

/**
 * Submits a complete proposed sequence for an existing route. This method
 * does not directly update routes or route_stops; approval applies the change.
 */
export async function submitRouteChangeProposal(
  input: RouteChangeProposalInput,
): Promise<RouteChangeProposalSubmitResult> {
  if (!isPositiveSafeInteger(input.routeId)) {
    throw new Error("Invalid target route.");
  }

  if (input.proposalType === "remove_points") {
    throw new Error(
      "Removal requests must use the route-change proposal service so the removed locations are recorded for moderator approval.",
    );
  }

  if (
    input.proposalType !== "insert_point" &&
    input.proposalType !== "extend_route" &&
    input.proposalType !== "combined"
  ) {
    throw new Error("Invalid route-change proposal type.");
  }

  if (!Array.isArray(input.points) || input.points.length < 2 || input.points.length > 100) {
    throw new Error("A proposed route must contain between 2 and 100 locations.");
  }

  const payload: Record<string, unknown> = {
    points: input.points.map(routeChangePointPayload),
  };
  const proposedName = input.proposedName?.trim();

  if (proposedName) {
    if (proposedName.length > 180) {
      throw new Error("The proposed route name cannot exceed 180 characters.");
    }
    payload.proposed_name = proposedName;
  }

  const { data, error } = await supabase.rpc("submit_route_change_proposal", {
    p_route_id: input.routeId,
    p_proposal_type: input.proposalType,
    p_payload: payload,
  });

  if (error) throw new Error(error.message);
  if (!isRouteChangeProposalSubmitResult(data)) {
    throw new Error("Route-change proposal service returned an invalid response.");
  }

  if (data.route_id !== input.routeId || data.proposal_type !== input.proposalType) {
    throw new Error("Route-change proposal service returned an unexpected result.");
  }

  return {
    proposalId: data.proposal_id,
    routeId: data.route_id,
    proposalType: data.proposal_type,
    moderationStatus: data.moderation_status,
    pointCount: data.point_count,
    createdPointCount: data.created_point_count,
    points: data.points.map((point): RouteChangeSubmitPoint => ({
      kind: point.kind,
      id: point.id,
      isNewPoint: point.is_new_point,
    })),
  };
}
