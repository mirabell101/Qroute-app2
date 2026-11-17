import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminNotificationRecord {
  id: string;
  postId: string;
  reportId: number | null;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

export interface AdminNotificationList {
  notifications: AdminNotificationRecord[];
  unreadCount: number;
}

interface NotificationRow {
  id: unknown;
  post_id: unknown;
  report_id: unknown;
  title: unknown;
  message: unknown;
  created_at: unknown;
}

function parseNotificationRow(row: NotificationRow): AdminNotificationRecord {
  if (
    typeof row.id !== "string" ||
    !row.id ||
    typeof row.post_id !== "string" ||
    !row.post_id ||
    !(row.report_id === null || typeof row.report_id === "number") ||
    typeof row.title !== "string" ||
    typeof row.message !== "string" ||
    typeof row.created_at !== "string"
  ) {
    throw new Error("Admin notification query returned an invalid event record.");
  }

  return {
    id: row.id,
    postId: row.post_id,
    reportId: row.report_id,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    isRead: false,
  };
}

function parseEventIds(data: unknown): Set<string> {
  if (!Array.isArray(data)) {
    throw new Error("Admin notification query returned invalid event data.");
  }

  const ids = new Set<string>();
  for (const row of data) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof (row as { id?: unknown }).id !== "string" ||
      !(row as { id: string }).id
    ) {
      throw new Error("Admin notification query returned an invalid event record.");
    }
    ids.add((row as { id: string }).id);
  }
  return ids;
}

function parseReadNotificationIds(data: unknown): Set<string> {
  if (!Array.isArray(data)) {
    throw new Error("Admin notification query returned invalid receipt data.");
  }

  const ids = new Set<string>();
  for (const row of data) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof (row as { notification_id?: unknown }).notification_id !== "string"
    ) {
      throw new Error("Admin notification query returned an invalid receipt record.");
    }
    ids.add((row as { notification_id: string }).notification_id);
  }
  return ids;
}

// Events are the canonical data; receipts only supply per-admin read state.
// Both queries run through the caller's request-scoped client, so database
// RLS restricts events and receipts to a verified administrator.
export async function listAdminNotifications(
  client: SupabaseClient,
  adminUserId: string,
): Promise<AdminNotificationList> {
  const [eventsResult, readsResult] = await Promise.all([
    client
      .from("admin_notifications")
      .select("id, post_id, report_id, title, message, created_at")
      .order("created_at", { ascending: false }),
    client
      .from("admin_notification_reads")
      .select("notification_id")
      .eq("admin_user_id", adminUserId),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (readsResult.error) throw readsResult.error;
  if (!Array.isArray(eventsResult.data)) {
    throw new Error("Admin notification query returned incomplete event data.");
  }

  const readIds = parseReadNotificationIds(readsResult.data);
  const notifications = eventsResult.data.map((row) => {
    const notification = parseNotificationRow(row as NotificationRow);
    return {
      ...notification,
      isRead: readIds.has(notification.id),
    };
  });

  return {
    notifications,
    unreadCount: notifications.filter((notification) => !notification.isRead).length,
  };
}

export async function getAdminUnreadNotificationCount(
  client: SupabaseClient,
  adminUserId: string,
): Promise<number> {
  const [eventsResult, readsResult] = await Promise.all([
    client.from("admin_notifications").select("id"),
    client
      .from("admin_notification_reads")
      .select("notification_id")
      .eq("admin_user_id", adminUserId),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (readsResult.error) throw readsResult.error;

  const eventIds = parseEventIds(eventsResult.data);
  const readIds = parseReadNotificationIds(readsResult.data);
  let unreadCount = 0;
  for (const id of eventIds) {
    if (!readIds.has(id)) unreadCount += 1;
  }
  return unreadCount;
}

// A repeated mark-read request is idempotent: the database primary key
// produces 23505 for an existing receipt, which is a successful no-op.
export async function markAdminNotificationRead(
  client: SupabaseClient,
  adminUserId: string,
  notificationId: string,
): Promise<void> {
  const { error } = await client.from("admin_notification_reads").insert({
    notification_id: notificationId,
    admin_user_id: adminUserId,
  });

  if (error && error.code !== "23505") throw error;
}
