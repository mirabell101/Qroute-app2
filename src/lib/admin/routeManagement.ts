import { requestRouteManagement } from "./request";
import {
  isAdminRouteChangeProposalRecord,
  isAdminRouteRecord,
  isAdminRouteChangeProposalModerationResult,
  isAdminTransitPointRecord,
  isAdminTransportTypeRecord,
  isPositiveInteger,
  isRecord,
  normalizeAdminRouteChangeProposalModerationResult,
} from "./validation";
import type {
  AdminRouteChangeProposalAction,
  AdminRouteChangeProposalModerationResult,
  AdminRouteManagementData,
  AdminTransitPointRecord,
  RouteManagementEntityType,
} from "./types";

export async function getRouteManagementData(
  expectedUserId: string,
): Promise<AdminRouteManagementData> {
  const payload = await requestRouteManagement("/", expectedUserId);

  if (!isRecord(payload.records)) {
    throw new Error("Route Management returned an invalid response.");
  }

  const records = payload.records;
  if (
    !Array.isArray(records.routes) ||
    !records.routes.every(isAdminRouteRecord) ||
    !Array.isArray(records.stops) ||
    !records.stops.every(isAdminTransitPointRecord) ||
    !Array.isArray(records.terminals) ||
    !records.terminals.every(isAdminTransitPointRecord) ||
    !Array.isArray(records.transportTypes) ||
    !records.transportTypes.every(isAdminTransportTypeRecord) ||
    !Array.isArray(records.routeChangeProposals) ||
    !records.routeChangeProposals.every(isAdminRouteChangeProposalRecord)
  ) {
    throw new Error("Route Management returned invalid record data.");
  }

  return {
    routes: records.routes,
    stops: records.stops as AdminTransitPointRecord[],
    terminals: records.terminals as AdminTransitPointRecord[],
    transportTypes: records.transportTypes,
    routeChangeProposals: records.routeChangeProposals,
  };
}

export async function moderateRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
  action: "approve" | "reject" | "mute" | "unmute" | "ban" | "unban",
  moderationNote?: string,
): Promise<void> {
  if (!isPositiveInteger(id)) {
    throw new Error("A valid record ID is required.");
  }

  if (moderationNote !== undefined && moderationNote.length > 500) {
    throw new Error("Moderation notes cannot exceed 500 characters.");
  }

  await requestRouteManagement(`/moderation/${entityType}/${id}`, expectedUserId, {
    method: "POST",
    body: {
      action,
      ...(moderationNote ? { moderation_note: moderationNote } : {}),
    },
  });
}

/**
 * Moderates an existing-route modification proposal. Kept separate from the
 * ordinary route/stop/terminal contribution moderation endpoint.
 *
 * The database RPC currently returns snake_case JSON keys. The client adapter
 * normalizes them into the established camelCase frontend result contract.
 */
export async function moderateRouteChangeProposal(
  expectedUserId: string,
  proposalId: number,
  action: AdminRouteChangeProposalAction,
  moderationNote?: string,
): Promise<AdminRouteChangeProposalModerationResult> {
  if (!isPositiveInteger(proposalId)) {
    throw new Error("A valid route-change proposal ID is required.");
  }

  if (action !== "approve" && action !== "reject") {
    throw new Error("A valid proposal moderation action is required.");
  }

  if (
    moderationNote !== undefined &&
    (typeof moderationNote !== "string" || moderationNote.length > 500)
  ) {
    throw new Error("Moderation notes cannot exceed 500 characters.");
  }

  const payload = await requestRouteManagement(`/proposals/${proposalId}/moderation`, expectedUserId, {
    method: "POST",
    body: {
      action,
      ...(moderationNote !== undefined ? { moderation_note: moderationNote } : {}),
    },
  });

  const result = normalizeAdminRouteChangeProposalModerationResult(payload.result);
  if (!result || !isAdminRouteChangeProposalModerationResult(result)) {
    throw new Error("Route Management returned an invalid proposal moderation result.");
  }

  return result;
}

export async function updateRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isPositiveInteger(id)) {
    throw new Error("A valid record ID is required.");
  }

  await requestRouteManagement(`/records/${entityType}/${id}`, expectedUserId, {
    method: "PATCH",
    body: payload,
  });
}

export async function archiveRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
): Promise<void> {
  if (!isPositiveInteger(id)) {
    throw new Error("A valid record ID is required.");
  }

  await requestRouteManagement(`/records/${entityType}/${id}`, expectedUserId, {
    method: "DELETE",
  });
}

export async function createAdminTransportType(
  expectedUserId: string,
  name: string,
  color: string,
): Promise<void> {
  await requestRouteManagement("/transport-types", expectedUserId, {
    method: "POST",
    body: { name, color },
  });
}

export async function updateAdminTransportType(
  expectedUserId: string,
  id: number,
  name: string,
  color: string,
): Promise<void> {
  if (!isPositiveInteger(id)) {
    throw new Error("A valid transport type ID is required.");
  }

  await requestRouteManagement(`/transport-types/${id}`, expectedUserId, {
    method: "PATCH",
    body: { name, color },
  });
}
