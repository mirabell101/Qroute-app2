import type { AdminRecentActivityItem, AdminSummary } from "../types";
import { isNullableCount, isNullableString, isNonNegativeInteger, isRecord } from "./common";

function isRecentActivityItem(value: unknown): value is AdminRecentActivityItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.actionKey === "string" &&
    typeof value.category === "string" &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.adminDisplayName === "string" &&
    isNullableString(value.adminUsername) &&
    isNullableString(value.targetType) &&
    isNullableString(value.targetLabel) &&
    typeof value.occurredAt === "string"
  );
}

function isNullableRecentActivity(value: unknown): value is AdminRecentActivityItem[] | null {
  return value === null || (Array.isArray(value) && value.every(isRecentActivityItem));
}

export function parseAdminSummary(value: unknown): AdminSummary {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.registeredUsers) ||
    !isNonNegativeInteger(value.routes) ||
    !isNonNegativeInteger(value.communityPosts) ||
    !isNullableCount(value.reports) ||
    !isNullableRecentActivity(value.recentActivity)
  ) {
    throw new Error("Admin service returned an invalid response.");
  }

  return {
    registeredUsers: value.registeredUsers,
    routes: value.routes,
    communityPosts: value.communityPosts,
    reports: value.reports,
    recentActivity: value.recentActivity,
  };
}
