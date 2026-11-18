import type { AdminNotificationRecord } from "@/lib/adminApi";

export type NotificationsViewState = "loading" | "error" | "empty" | "ready";

export function getNotificationsViewState(
  notifications: AdminNotificationRecord[],
  loading: boolean,
  errorMessage: string,
): NotificationsViewState {
  if (errorMessage.trim()) return "error";
  if (loading) return "loading";
  if (notifications.length === 0) return "empty";
  return "ready";
}

export function buildReportDeepLink(reportId: unknown): string | null {
  if (
    typeof reportId !== "number" ||
    !Number.isSafeInteger(reportId) ||
    reportId <= 0
  ) {
    return null;
  }
  return `/admin/reports?reportId=${reportId}`;
}

export function parseReportIdParam(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const reportId = Number(value);
  return Number.isSafeInteger(reportId) && reportId > 0 ? reportId : null;
}

export function markNotificationReadLocally(
  notifications: AdminNotificationRecord[],
  notificationId: string,
): AdminNotificationRecord[] {
  return notifications.map((notification) =>
    notification.id === notificationId
      ? { ...notification, isRead: true }
      : notification,
  );
}

export function countUnreadNotifications(
  notifications: AdminNotificationRecord[],
): number {
  return notifications.filter((notification) => !notification.isRead).length;
}
