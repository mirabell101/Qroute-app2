import { requestAdmin } from "./request";
import { isNonNegativeInteger, parseAdminNotifications } from "./validation";
import type { AdminNotificationList } from "./types";

export async function getAdminUnreadNotificationCount(expectedUserId: string): Promise<number> {
  const payload = await requestAdmin("/notifications/unread-count", expectedUserId);
  if (!isNonNegativeInteger(payload.unreadCount)) {
    throw new Error("Admin service returned an invalid response.");
  }
  return payload.unreadCount;
}

export async function getAdminNotifications(expectedUserId: string): Promise<AdminNotificationList> {
  const payload = await requestAdmin("/notifications", expectedUserId);
  return parseAdminNotifications(payload);
}

export async function markAdminNotificationRead(
  expectedUserId: string,
  notificationId: string,
): Promise<void> {
  await requestAdmin(`/notifications/${encodeURIComponent(notificationId)}/read`, expectedUserId, {
    method: "PATCH",
  });
}
