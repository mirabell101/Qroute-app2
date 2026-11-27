import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getAdminMapImagesForLocation,
  getAdminMapImagesForProposal,
  getRouteManagementData,
  getRouteArchiveRecoveryStatuses,
  type AdminRouteArchiveRecoveryStatus,
  type AdminMapImage,
  type AdminMapImageLocationType,
  type AdminRouteChangeProposalRecord,
  type AdminRouteManagementData,
} from "@/lib/adminApi";
import { getUserRole } from "@/lib/authSession";
import {
  getSessionSnapshot,
  isCurrentAuthenticatedSession,
  subscribeSessionState,
} from "@/lib/sessionCoordinator";
import type { ManagementRow } from "../types";

const emptyData: AdminRouteManagementData = {
  routes: [],
  stops: [],
  terminals: [],
  transportTypes: [],
  routeChangeProposals: [],
};

type UserRole = "admin" | "moderator" | null;

interface UseRouteManagementDataOptions {
  userId: string | null;
  selectedRow: ManagementRow | null;
  selectedProposal: AdminRouteChangeProposalRecord | null;
}

export function useRouteManagementData({
  userId,
  selectedRow,
  selectedProposal,
}: UseRouteManagementDataOptions) {
  const sessionSnapshot = useSyncExternalStore(
    subscribeSessionState,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  const sessionIdentity =
    sessionSnapshot.status === "authenticated" &&
    sessionSnapshot.purpose === "authenticated"
      ? sessionSnapshot.identity
      : null;

  const [data, setData] = useState<AdminRouteManagementData>(emptyData);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [reviewImages, setReviewImages] = useState<AdminMapImage[]>([]);
  const [reviewImagesLoading, setReviewImagesLoading] = useState(false);
  const [reviewImagesError, setReviewImagesError] = useState<string | null>(null);
  const [imageRefreshVersion, setImageRefreshVersion] = useState(0);
  const [archiveRecoveryStatuses, setArchiveRecoveryStatuses] = useState<AdminRouteArchiveRecoveryStatus[]>([]);
  const [archiveRecoveryLoading, setArchiveRecoveryLoading] = useState(false);
  const [archiveRecoveryError, setArchiveRecoveryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const identity = sessionIdentity;

    setRole(null);
    setRoleError(null);

    if (!userId || !identity || identity.userId !== userId) {
      setRoleError(
        !userId
          ? "Please sign in to continue."
          : "The active session could not be verified.",
      );
      return () => { active = false; };
    }

    void getUserRole(userId, identity)
      .then((currentRole) => {
        if (!active || !isCurrentAuthenticatedSession(identity)) return;
        const allowed = currentRole === "admin" || currentRole === "moderator";
        setRole(allowed ? currentRole : null);
        setRoleError(allowed ? null : "Route Management access could not be verified.");
      })
      .catch((error: unknown) => {
        if (!active || !isCurrentAuthenticatedSession(identity)) return;
        setRole(null);
        setRoleError(error instanceof Error ? error.message : "Unable to verify your role.");
      });

    return () => { active = false; };
  }, [userId, sessionIdentity?.generation, sessionSnapshot.status]);

  useEffect(() => {
    let active = true;
    const identity = sessionIdentity;

    setDataOwnerId(null);
    setData(emptyData);
    setErrorMessage(null);

    if (!userId || !identity || identity.userId !== userId) {
      setIsLoading(false);
      if (userId) {
        setErrorMessage("The active session could not be verified. Please try again.");
      }
      return () => { active = false; };
    }

    if (!isCurrentAuthenticatedSession(identity)) {
      setIsLoading(false);
      setErrorMessage("The active session could not be verified. Please try again.");
      return () => { active = false; };
    }

    setIsLoading(true);
    void getRouteManagementData(userId)
      .then((records) => {
        if (!active || !isCurrentAuthenticatedSession(identity)) return;
        setData(records);
        setDataOwnerId(userId);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!active || !isCurrentAuthenticatedSession(identity)) return;
        setDataOwnerId(null);
        setData(emptyData);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load records.");
      })
      .finally(() => {
        if (active && isCurrentAuthenticatedSession(identity)) setIsLoading(false);
      });

    return () => { active = false; };
  }, [userId, sessionIdentity?.generation, sessionSnapshot.status, retryCount]);


  // Archive snapshots are internal database data. Only administrators receive
  // safe recovery summaries from the dedicated admin-only endpoint.
  useEffect(() => {
    let active = true;
    const identity = sessionIdentity;

    setArchiveRecoveryStatuses([]);
    setArchiveRecoveryError(null);

    if (
      !userId ||
      role !== "admin" ||
      !identity ||
      identity.userId !== userId ||
      !isCurrentAuthenticatedSession(identity)
    ) {
      setArchiveRecoveryLoading(false);
      return () => { active = false; };
    }

    setArchiveRecoveryLoading(true);
    void getRouteArchiveRecoveryStatuses(userId)
      .then((statuses) => {
        if (!active || !isCurrentAuthenticatedSession(identity)) return;
        setArchiveRecoveryStatuses(statuses);
        setArchiveRecoveryError(null);
      })
      .catch((error: unknown) => {
        if (!active || !isCurrentAuthenticatedSession(identity)) return;
        setArchiveRecoveryStatuses([]);
        setArchiveRecoveryError(
          error instanceof Error
            ? error.message
            : "Unable to check route archive recovery status.",
        );
      })
      .finally(() => {
        if (active && isCurrentAuthenticatedSession(identity)) {
          setArchiveRecoveryLoading(false);
        }
      });

    return () => { active = false; };
  }, [userId, role, sessionIdentity?.generation, sessionSnapshot.status, retryCount]);

  useEffect(() => {
    let active = true;
    const identity = sessionIdentity;
    const hasLocationTarget = Boolean(
      selectedRow &&
      (selectedRow.entityType === "stop" || selectedRow.entityType === "terminal"),
    );

    if (
      !userId || !identity || identity.userId !== userId ||
      !isCurrentAuthenticatedSession(identity) ||
      (!selectedProposal && !hasLocationTarget)
    ) {
      setReviewImages([]);
      setReviewImagesLoading(false);
      setReviewImagesError(null);
      return () => { active = false; };
    }

    const imageRequest = selectedProposal
      ? getAdminMapImagesForProposal(userId, selectedProposal.id)
      : getAdminMapImagesForLocation(
          userId,
          selectedRow!.entityType as AdminMapImageLocationType,
          selectedRow!.id,
        );

    setReviewImages([]);
    setReviewImagesLoading(true);
    setReviewImagesError(null);

    void imageRequest
      .then((images) => {
        if (active && isCurrentAuthenticatedSession(identity)) setReviewImages(images);
      })
      .catch((error: unknown) => {
        if (active && isCurrentAuthenticatedSession(identity)) {
          setReviewImagesError(
            error instanceof Error ? error.message : "Unable to load map photographs.",
          );
        }
      })
      .finally(() => {
        if (active) setReviewImagesLoading(false);
      });

    return () => { active = false; };
  }, [
    userId,
    sessionIdentity?.generation,
    sessionSnapshot.status,
    selectedRow,
    selectedProposal,
    imageRefreshVersion,
  ]);

  const refreshData = () => {
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  return {
    data,
    dataOwnerId,
    role,
    roleError,
    isLoading,
    errorMessage,
    setErrorMessage,
    refreshData,
    reviewImages,
    reviewImagesLoading,
    reviewImagesError,
    setReviewImagesError,
    setImageRefreshVersion,
    archiveRecoveryStatuses,
    archiveRecoveryLoading,
    archiveRecoveryError,
  };
}
