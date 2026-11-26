import type { AdminNotificationRecord } from "../types";
import { isNonNegativeInteger, isPositiveInteger, isRecord } from "./common";

export function isAdminNotificationRecord(value: unknown): value is AdminNotificationRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.postId === "string" &&
    value.postId.length > 0 &&
    (value.reportId === null || isPositiveInteger(value.reportId)) &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.isRead === "boolean"
  );
}

export function parseAdminNotifications(value: unknown): {
  notifications: AdminNotificationRecord[];
  unreadCount: number;
} {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.unreadCount) ||
    !Array.isArray(value.notifications) ||
    !value.notifications.every(isAdminNotificationRecord)
  ) {
    throw new Error("Admin service returned an invalid response.");
  }

  return {
    notifications: value.notifications as AdminNotificationRecord[],
    unreadCount: value.unreadCount,
  };
}
