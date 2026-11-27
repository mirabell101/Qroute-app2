import type { Dispatch, SetStateAction } from "react";
import {
  archiveRouteManagementRecord,
  reinstateArchivedRoute,
  reconcileRestoredRouteArchive,
  moderateAdminMapImage,
  moderateRouteChangeProposal,
  moderateRouteManagementRecord,
  type AdminMapImage,
  type AdminRouteChangeProposalRecord,
  type AdminRouteManagementData,
  type RouteManagementEntityType,
} from "@/lib/adminApi";
import type { ManagementRow } from "../types";

type UserRole = "admin" | "moderator" | null;
interface UseRouteManagementActionsOptions {
  userId: string | null;
  role: UserRole;
  isAdmin: boolean;
  data: AdminRouteManagementData;
  isMutating: boolean;
  setIsMutating: Dispatch<SetStateAction<boolean>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setReviewImagesError: Dispatch<SetStateAction<string | null>>;
  setSelectedRow: Dispatch<SetStateAction<ManagementRow | null>>;
  setSelectedProposal: Dispatch<SetStateAction<AdminRouteChangeProposalRecord | null>>;
  setImageRefreshVersion: Dispatch<SetStateAction<number>>;
  refreshData: () => void;
}

export function useRouteManagementActions({
  userId,
  role,
  isAdmin,
  data,
  isMutating,
  setIsMutating,
  setErrorMessage,
  setReviewImagesError,
  setSelectedRow,
  setSelectedProposal,
  setImageRefreshVersion,
  refreshData,
}: UseRouteManagementActionsOptions) {
  const handleMapImageModeration = async (
    image: AdminMapImage,
    action: "approve" | "reject",
  ) => {
    if (!userId || !isAdmin || isMutating) return;

    let moderationNote: string | undefined;
    if (action === "reject") {
      const enteredNote = window.prompt(
        "Optional photo rejection note (500 characters maximum):",
        "",
      );
      if (enteredNote === null) return;
      moderationNote = enteredNote;
      if (moderationNote.length > 500) {
        setReviewImagesError("Photo moderation notes must be 500 characters or fewer.");
        return;
      }
    }

    setIsMutating(true);
    setReviewImagesError(null);
    try {
      await moderateAdminMapImage(userId, image.id, action, moderationNote);
      setImageRefreshVersion((version) => version + 1);
    } catch (error: unknown) {
      setReviewImagesError(
        error instanceof Error ? error.message : "Unable to moderate this photograph.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleModeration = async (
    row: ManagementRow,
    action: "approve" | "reject",
  ) => {
    if (!userId || row.entityType === "transport_type" || row.moderationStatus !== "pending") return;

    const moderationNote = action === "reject"
      ? window.prompt("Optional rejection note (500 characters maximum):", "") ?? null
      : undefined;
    if (moderationNote === null) return;
    if (moderationNote !== undefined && moderationNote.length > 500) {
      setErrorMessage("Rejection notes must be 500 characters or fewer.");
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await moderateRouteManagementRecord(
        userId,
        row.entityType as RouteManagementEntityType,
        row.id,
        action,
        moderationNote,
      );
      setSelectedRow(null);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update moderation status.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleRouteChangeProposalModeration = async (
    proposal: AdminRouteChangeProposalRecord,
    action: "approve" | "reject",
  ) => {
    if (!userId || !role || isMutating || proposal.status !== "pending") return;

    if (action === "approve" && proposal.route_change_proposal_points.length < 2) {
      window.alert("This proposal does not contain enough route points to approve.");
      return;
    }
    if (action === "approve" && !data.routes.some((route) => route.id === proposal.route_id)) {
      window.alert("The target route could not be loaded. The proposal cannot be approved from this page.");
      return;
    }
    if (
      action === "approve" &&
      !window.confirm(
        `Approve this route change proposal?\n\nThe existing route (ID ${proposal.route_id}) will be updated. Its route identity will remain the same.`,
      )
    ) return;

    const moderationNote = action === "reject"
      ? window.prompt("Optional rejection note (500 characters maximum):", "") ?? null
      : undefined;
    if (moderationNote === null) return;
    if (moderationNote !== undefined && moderationNote.length > 500) {
      window.alert("Rejection notes must be 500 characters or fewer.");
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);
    try {
      const result = await moderateRouteChangeProposal(userId, proposal.id, action, moderationNote);
      if (result.status === "conflicted") {
        window.alert(
          "This proposal could not be applied because the route or one of its underlying records changed after the proposal was submitted.\n\nNo route changes were applied. The proposal has been marked as conflicted.",
        );
      } else if (result.status === "approved") {
        window.alert("The route change proposal was approved and applied successfully.");
      } else if (result.status === "rejected") {
        window.alert("The route change proposal was rejected.");
      }
      setSelectedProposal(null);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to moderate the route change proposal.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleMapInformationAction = async (
    row: ManagementRow,
    action: "mute" | "unmute" | "ban" | "unban",
  ) => {
    if (!userId || !role || row.entityType === "transport_type" || row.isDeleted) return;
    if (action === "ban" && !window.confirm(`Ban "${row.name}" from public map information?`)) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await moderateRouteManagementRecord(userId, row.entityType, row.id, action);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update map information status.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleReinstateRoute = async (row: ManagementRow) => {
    const recovery = row.archiveRecovery;
    if (
      !userId ||
      !isAdmin ||
      isMutating ||
      row.entityType !== "route" ||
      !row.isDeleted ||
      !recovery?.canReinstate
    ) return;

    const reviewCount =
      recovery.changedLocationCount + recovery.missingLocationCount;
    const confirmation = [
      `Re-instate "${row.name}"?`,
      "",
      "The route will return to its exact pre-archive active and ban state.",
      "Only locations that still match this archive operation will be restored.",
      ...(reviewCount > 0
        ? [
            "",
            `${recovery.changedLocationCount} changed and ${recovery.missingLocationCount} missing location(s) will be left untouched for manual review.`,
          ]
        : []),
    ].join("\n");

    if (!window.confirm(confirmation)) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      const result = await reinstateArchivedRoute(userId, row.id);
      setSelectedRow(null);
      refreshData();

      if (
        result.skippedChangedLocationCount > 0 ||
        result.missingLocationCount > 0
      ) {
        window.alert(
          `Route reinstated.\n\n` +
          `${result.restoredLocationCount} location(s) restored.\n` +
          `${result.skippedChangedLocationCount} changed location(s) left untouched.\n` +
          `${result.missingLocationCount} missing location(s) could not be restored.\n\n` +
          "Review the skipped locations manually in Route Management.",
        );
      }
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to reinstate the archived route.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleReconcileRouteArchive = async (row: ManagementRow) => {
    const recovery = row.archiveRecovery;
    if (
      !userId ||
      !isAdmin ||
      isMutating ||
      row.entityType !== "route" ||
      row.isDeleted ||
      !recovery?.canReconcile
    ) return;

    if (!window.confirm(
      `Finalize recovery history for "${row.name}"?\n\n` +
      "The route and every location in this archive operation already match their exact original full-row snapshots. " +
      "This action will only close the recovery tracking operation. It will not change the route, stops, or terminals.\n\n" +
      "Afterward, the route can be archived again normally.",
    )) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      const result = await reconcileRestoredRouteArchive(userId, row.id);
      setSelectedRow(null);
      refreshData();
      window.alert(
        `Recovery history finalized.\n\n` +
        `${result.locationSnapshotCount} location snapshot(s) reconciled.\n` +
        "No route, stop, or terminal data was changed.",
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to finalize route archive recovery.",
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleArchive = async (row: ManagementRow) => {
    if (!userId || !isAdmin || row.entityType === "transport_type") return;
    if (
      row.entityType === "route" &&
      !row.isDeleted &&
      row.archiveRecovery?.archiveOperationId
    ) {
      setErrorMessage(
        row.archiveRecovery.canReconcile
          ? "Finalize this route's existing recovery history before archiving it again."
          : row.archiveRecovery.reason,
      );
      return;
    }
    if (!window.confirm(`Archive "${row.name}"? This hides it without deleting its record.`)) return;

    setIsMutating(true);
    setErrorMessage(null);
    try {
      await archiveRouteManagementRecord(userId, row.entityType, row.id);
      refreshData();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to archive the record.");
    } finally {
      setIsMutating(false);
    }
  };

  return {
    handleMapImageModeration,
    handleModeration,
    handleRouteChangeProposalModeration,
    handleMapInformationAction,
    handleArchive,
    handleReinstateRoute,
    handleReconcileRouteArchive,
  };
}
