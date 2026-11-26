import type { AdminMapImage, AdminMapImageModerationStatus } from "../types";
import { isNullableImagePreviewUrl, isNullableString, isPositiveInteger, isValidDateString, isRecord } from "./common";

function isAdminMapImageModerationStatus(value: unknown): value is AdminMapImageModerationStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

export function isAdminMapImage(value: unknown): value is AdminMapImage {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.id) ||
    !(value.terminalId === null || isPositiveInteger(value.terminalId)) ||
    !(value.stopId === null || isPositiveInteger(value.stopId)) ||
    !isNullableString(value.caption) ||
    !isNullableString(value.createdBy) ||
    !isValidDateString(value.createdAt) ||
    typeof value.isApproved !== "boolean" ||
    !isAdminMapImageModerationStatus(value.moderationStatus) ||
    !isNullableString(value.moderationNote) ||
    !isNullableString(value.moderatedBy) ||
    !(value.moderatedAt === null || isValidDateString(value.moderatedAt)) ||
    typeof value.isBanned !== "boolean" ||
    typeof value.isDeleted !== "boolean" ||
    !(value.proposalId === null || isPositiveInteger(value.proposalId)) ||
    !(value.proposalStopOrder === null || isPositiveInteger(value.proposalStopOrder)) ||
    !isNullableImagePreviewUrl(value.imageUrl)
  ) {
    return false;
  }

  const hasTerminal = value.terminalId !== null;
  const hasStop = value.stopId !== null;
  if (hasTerminal === hasStop) return false;

  const hasProposalId = value.proposalId !== null;
  const hasProposalStopOrder = value.proposalStopOrder !== null;
  if (hasProposalId !== hasProposalStopOrder) return false;

  return true;
}
