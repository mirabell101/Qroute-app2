import { requestAdmin } from "./request";
import { isAdminMapImage, isPositiveInteger } from "./validation";
import type {
  AdminMapImage,
  AdminMapImageLocationType,
  AdminMapImageModerationAction,
} from "./types";

/** Retrieves photographs attached directly to an existing stop or terminal. */
export async function getAdminMapImagesForLocation(
  expectedUserId: string,
  entityType: AdminMapImageLocationType,
  entityId: number,
): Promise<AdminMapImage[]> {
  if (entityType !== "stop" && entityType !== "terminal") {
    throw new Error("A valid map location type is required.");
  }
  if (!isPositiveInteger(entityId)) {
    throw new Error("A valid location ID is required.");
  }

  const payload = await requestAdmin(`/map-images/locations/${entityType}/${entityId}`, expectedUserId);
  if (!Array.isArray(payload.images) || !payload.images.every(isAdminMapImage)) {
    throw new Error("Admin service returned invalid map image data.");
  }

  const images = payload.images as AdminMapImage[];
  const containsUnexpectedImage = images.some((image) => {
    if (image.proposalId !== null) return true;
    if (entityType === "terminal") {
      return image.terminalId !== entityId || image.stopId !== null;
    }
    return image.stopId !== entityId || image.terminalId !== null;
  });

  if (containsUnexpectedImage) {
    throw new Error("Admin service returned images associated with another location.");
  }

  return images;
}

/** Retrieves photographs associated with one route-change proposal. */
export async function getAdminMapImagesForProposal(
  expectedUserId: string,
  proposalId: number,
): Promise<AdminMapImage[]> {
  if (!isPositiveInteger(proposalId)) {
    throw new Error("A valid route-change proposal ID is required.");
  }

  const payload = await requestAdmin(`/map-images/proposals/${proposalId}`, expectedUserId);
  if (!Array.isArray(payload.images) || !payload.images.every(isAdminMapImage)) {
    throw new Error("Admin service returned invalid proposal image data.");
  }

  const images = payload.images as AdminMapImage[];
  if (images.some((image) => image.proposalId !== proposalId || image.proposalStopOrder === null)) {
    throw new Error("Admin service returned images associated with another proposal.");
  }

  return images;
}

/** Individually approves or rejects a map photograph. */
export async function moderateAdminMapImage(
  expectedUserId: string,
  imageId: number,
  action: AdminMapImageModerationAction,
  moderationNote?: string,
): Promise<void> {
  if (!isPositiveInteger(imageId)) {
    throw new Error("A valid map image ID is required.");
  }
  if (action !== "approve" && action !== "reject") {
    throw new Error("A valid image moderation action is required.");
  }
  if (moderationNote !== undefined && (typeof moderationNote !== "string" || moderationNote.length > 500)) {
    throw new Error("Moderation notes cannot exceed 500 characters.");
  }

  const payload = await requestAdmin(`/map-images/${imageId}/moderation`, expectedUserId, {
    method: "POST",
    body: {
      action,
      ...(moderationNote !== undefined ? { moderation_note: moderationNote } : {}),
    },
  });

  if (typeof payload.result !== "object" || payload.result === null || Array.isArray(payload.result)) {
    throw new Error("Admin service returned an invalid image moderation result.");
  }
}
