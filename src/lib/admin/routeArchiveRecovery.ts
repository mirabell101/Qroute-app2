import { requestRouteManagement } from "./request";
import { isPositiveInteger, isRecord } from "./validation";

export type AdminRouteArchiveRecoveryStatusKey =
  | "legacy_archive"
  | "already_restored_untracked"
  | "already_restored_needs_review"
  | "route_state_changed"
  | "route_changed"
  | "locations_need_review"
  | "ready";

export interface AdminRouteArchiveRecoveryStatus {
  routeId: number;
  archiveOperationId: string | null;
  archivedAt: string | null;
  canReinstate: boolean;
  canReconcile: boolean;
  recoveryStatus: AdminRouteArchiveRecoveryStatusKey;
  reason: string;
  locationSnapshotCount: number;
  changedLocationCount: number;
  missingLocationCount: number;
  changedFromOriginalCount: number;
  missingFromOriginalCount: number;
}

export interface AdminRouteReinstatementResult {
  routeId: number;
  archiveOperationId: string;
  status: "reinstated";
  restoredLocationCount: number;
  skippedChangedLocationCount: number;
  missingLocationCount: number;
  reinstatedAt: string;
}

export interface AdminRouteArchiveReconciliationResult {
  routeId: number;
  archiveOperationId: string;
  status: "reconciled";
  recordsChanged: false;
  locationSnapshotCount: number;
  reconciledAt: string;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isArchiveRecoveryStatus(value: unknown): value is AdminRouteArchiveRecoveryStatus {
  return (
    isRecord(value) &&
    isPositiveInteger(value.routeId) &&
    isNullableString(value.archiveOperationId) &&
    isNullableString(value.archivedAt) &&
    typeof value.canReinstate === "boolean" &&
    typeof value.canReconcile === "boolean" &&
    [
      "legacy_archive",
      "already_restored_untracked",
      "already_restored_needs_review",
      "route_state_changed",
      "route_changed",
      "locations_need_review",
      "ready",
    ].includes(String(value.recoveryStatus)) &&
    typeof value.reason === "string" &&
    isNonNegativeInteger(value.locationSnapshotCount) &&
    isNonNegativeInteger(value.changedLocationCount) &&
    isNonNegativeInteger(value.missingLocationCount) &&
    isNonNegativeInteger(value.changedFromOriginalCount) &&
    isNonNegativeInteger(value.missingFromOriginalCount)
  );
}

function isReconciliationResult(
  value: unknown,
): value is AdminRouteArchiveReconciliationResult {
  return (
    isRecord(value) &&
    isPositiveInteger(value.routeId) &&
    typeof value.archiveOperationId === "string" &&
    value.status === "reconciled" &&
    value.recordsChanged === false &&
    isNonNegativeInteger(value.locationSnapshotCount) &&
    typeof value.reconciledAt === "string"
  );
}

function isReinstatementResult(value: unknown): value is AdminRouteReinstatementResult {
  return (
    isRecord(value) &&
    isPositiveInteger(value.routeId) &&
    typeof value.archiveOperationId === "string" &&
    value.status === "reinstated" &&
    isNonNegativeInteger(value.restoredLocationCount) &&
    isNonNegativeInteger(value.skippedChangedLocationCount) &&
    isNonNegativeInteger(value.missingLocationCount) &&
    typeof value.reinstatedAt === "string"
  );
}

/**
 * Loads safe, admin-only archive recovery summaries. Raw archive snapshots
 * remain inside route_management_internal and are never sent to the client.
 */
export async function getRouteArchiveRecoveryStatuses(
  expectedUserId: string,
): Promise<AdminRouteArchiveRecoveryStatus[]> {
  const payload = await requestRouteManagement(
    "/archive-recovery",
    expectedUserId,
  );

  if (
    !Array.isArray(payload.recovery) ||
    !payload.recovery.every(isArchiveRecoveryStatus)
  ) {
    throw new Error("Route Management returned invalid archive recovery status.");
  }

  return payload.recovery as AdminRouteArchiveRecoveryStatus[];
}

/**
 * Restores one tracked archived route. The database performs the authoritative
 * snapshot comparison and skips any locations that changed after archiving.
 */
export async function reinstateArchivedRoute(
  expectedUserId: string,
  routeId: number,
): Promise<AdminRouteReinstatementResult> {
  if (!isPositiveInteger(routeId)) {
    throw new Error("A valid route ID is required.");
  }

  const payload = await requestRouteManagement(
    `/records/route/${routeId}/reinstate`,
    expectedUserId,
    { method: "POST" },
  );

  if (!isReinstatementResult(payload.result)) {
    throw new Error("Route Management returned an invalid reinstatement result.");
  }

  return payload.result;
}


/**
 * Closes a stale archive operation only when the live route and every
 * snapshotted location exactly match their original full-row snapshots.
 * The RPC changes recovery metadata only; it does not update public records.
 */
export async function reconcileRestoredRouteArchive(
  expectedUserId: string,
  routeId: number,
): Promise<AdminRouteArchiveReconciliationResult> {
  if (!isPositiveInteger(routeId)) {
    throw new Error("A valid route ID is required.");
  }

  const payload = await requestRouteManagement(
    `/records/route/${routeId}/reconcile-archive`,
    expectedUserId,
    { method: "POST" },
  );

  if (!isReconciliationResult(payload.result)) {
    throw new Error("Route Management returned an invalid archive reconciliation result.");
  }

  return payload.result;
}
