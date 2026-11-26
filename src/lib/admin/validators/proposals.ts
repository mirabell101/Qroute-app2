import type {
  AdminRouteChangeProposalModerationResult,
  AdminRouteChangeProposalPointRecord,
  AdminRouteChangeProposalRecord,
  AdminRouteChangeProposalStatus,
  AdminRouteChangeProposalType,
} from "../types";
import {
  isNonNegativeInteger,
  isNullableFiniteNumber,
  isNullableRecord,
  isNullableString,
  isPositiveInteger,
  isRecord,
  isValidDateString,
} from "./common";
import { isAdminTransitPointRecord } from "./routes";

function isAdminRouteChangeProposalType(value: unknown): value is AdminRouteChangeProposalType {
  return (
    value === "insert_point" ||
    value === "extend_route" ||
    value === "combined" ||
    value === "remove_points"
  );
}

function isAdminRouteChangeProposalStatus(value: unknown): value is AdminRouteChangeProposalStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "conflicted" ||
    value === "withdrawn"
  );
}

function isAdminRouteChangeProposalPointRecord(
  value: unknown,
): value is AdminRouteChangeProposalPointRecord {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.proposal_id) ||
    !isPositiveInteger(value.stop_order) ||
    !isNonNegativeInteger(value.proposed_stop_order) ||
    !(value.terminal_id === null || isPositiveInteger(value.terminal_id)) ||
    !(value.stop_id === null || isPositiveInteger(value.stop_id)) ||
    typeof value.is_new_point !== "boolean" ||
    typeof value.is_removed_from_route !== "boolean" ||
    !(value.replaces_stop_order === null || isPositiveInteger(value.replaces_stop_order)) ||
    !isNullableString(value.original_name) ||
    !isNullableFiniteNumber(value.original_latitude) ||
    !isNullableFiniteNumber(value.original_longitude) ||
    !isNullableString(value.proposed_name) ||
    !isNullableFiniteNumber(value.proposed_latitude) ||
    !isNullableFiniteNumber(value.proposed_longitude) ||
    !isNullableRecord(value.terminals, isAdminTransitPointRecord) ||
    !isNullableRecord(value.stops, isAdminTransitPointRecord)
  ) {
    return false;
  }

  const hasTerminal = value.terminal_id !== null;
  const hasStop = value.stop_id !== null;
  if (hasTerminal === hasStop) return false;

  if (value.is_removed_from_route) {
    if (value.is_new_point || value.proposed_stop_order !== 0) return false;
  } else if (value.proposed_stop_order < 1) {
    return false;
  }

  if (value.replaces_stop_order !== null && !value.is_new_point) return false;

  if (
    hasTerminal &&
    (!isRecord(value.terminals) || value.terminals.id !== value.terminal_id || value.stops !== null)
  ) {
    return false;
  }

  if (hasStop && (!isRecord(value.stops) || value.stops.id !== value.stop_id || value.terminals !== null)) {
    return false;
  }

  return true;
}

export function isAdminRouteChangeProposalRecord(value: unknown): value is AdminRouteChangeProposalRecord {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    !isPositiveInteger(value.route_id) ||
    !isNullableString(value.contributor_id) ||
    typeof value.contributor_display_name !== "string" ||
    !isNullableString(value.contributor_remarks) ||
    !isAdminRouteChangeProposalType(value.proposal_type) ||
    !isNullableString(value.proposed_name) ||
    !isRecord(value.base_route_snapshot) ||
    !isAdminRouteChangeProposalStatus(value.status) ||
    !isNullableString(value.moderation_note) ||
    !isNullableString(value.moderated_by) ||
    !isNullableString(value.moderator_display_name) ||
    !(value.moderated_at === null || isValidDateString(value.moderated_at)) ||
    !(value.applied_at === null || isValidDateString(value.applied_at)) ||
    !isValidDateString(value.created_at) ||
    !isValidDateString(value.updated_at) ||
    !Array.isArray(value.route_change_proposal_points) ||
    !value.route_change_proposal_points.every(isAdminRouteChangeProposalPointRecord)
  ) {
    return false;
  }

  const points = value.route_change_proposal_points as AdminRouteChangeProposalPointRecord[];
  if (points.length < 2 || points.length > 100) return false;

  const canonicalOrders = points.map((point) => point.stop_order).sort((a, b) => a - b);
  for (let index = 0; index < canonicalOrders.length; index += 1) {
    if (canonicalOrders[index] !== index + 1) return false;
  }

  if (points.some((point) => point.proposal_id !== value.id)) return false;

  const activePoints = points.filter((point) => !point.is_removed_from_route);
  const removedPoints = points.filter((point) => point.is_removed_from_route);
  const activeOrders = activePoints.map((point) => point.proposed_stop_order).sort((a, b) => a - b);
  if (activePoints.length < 2) return false;

  for (let index = 0; index < activeOrders.length; index += 1) {
    if (activeOrders[index] !== index + 1) return false;
  }

  if (
    value.proposal_type === "remove_points" &&
    (removedPoints.length < 1 || points.some((point) => point.is_new_point))
  ) {
    return false;
  }

  for (const point of points) {
    if (
      point.replaces_stop_order !== null &&
      !removedPoints.some((removed) => removed.stop_order === point.replaces_stop_order)
    ) {
      return false;
    }
  }

  return true;
}

export function isAdminRouteChangeProposalModerationResult(
  value: unknown,
): value is AdminRouteChangeProposalModerationResult {
  return (
    isRecord(value) &&
    isPositiveInteger(value.proposalId) &&
    isPositiveInteger(value.routeId) &&
    isAdminRouteChangeProposalType(value.proposalType) &&
    (value.status === "approved" || value.status === "rejected" || value.status === "conflicted") &&
    isNullableString(value.moderationNote) &&
    (value.appliedAt === null || isValidDateString(value.appliedAt)) &&
    (value.synchronization === null || isRecord(value.synchronization))
  );
}

/**
 * The SQL RPC currently returns snake_case JSON keys. Normalize that database
 * contract at the client boundary, while also accepting an already-normalized
 * camelCase response for backwards compatibility.
 */
export function normalizeAdminRouteChangeProposalModerationResult(
  value: unknown,
): AdminRouteChangeProposalModerationResult | null {
  if (isAdminRouteChangeProposalModerationResult(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  const normalized: unknown = {
    proposalId: value.proposal_id,
    routeId: value.route_id,
    proposalType: value.proposal_type,
    status: value.status,
    moderationNote: value.moderation_note,
    appliedAt: value.applied_at,
    synchronization: value.synchronization,
  };

  return isAdminRouteChangeProposalModerationResult(normalized)
    ? normalized
    : null;
}
