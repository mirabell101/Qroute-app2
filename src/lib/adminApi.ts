
import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { CommunityPost } from "@/lib/community";

export interface AdminRecentActivityItem {
  id: string;
  actionKey: string;
  category: string;
  title: string;
  detail: string;
  adminDisplayName: string;
  adminUsername: string | null;
  targetType: string | null;
  targetLabel: string | null;
  occurredAt: string;
}

export interface AdminSummary {
  registeredUsers: number;
  routes: number;
  communityPosts: number;
  reports: number | null;
  recentActivity: AdminRecentActivityItem[] | null;
}

interface AdminRoutePoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  is_approved: boolean | null;
  moderation_status?: "pending" | "approved" | "rejected";
}

interface AdminRouteStop {
  route_id: number;
  stop_order: number;
  terminals: AdminRoutePoint | null;
  stops: (AdminRoutePoint & {
    description: string | null;
    stop_type: "road_stop" | "train_station" | null;
  }) | null;
}

export interface AdminRouteRecord {
  id: number;
  name: string;
  transport_type_id: number;
  fare_area_id: number | null;
  is_active: boolean;
  is_approved: boolean;
  is_banned: boolean;
  is_deleted: boolean;
  moderation_status: "pending" | "approved" | "rejected";
  moderation_note?: string | null;
  transport_types: { name: string; color: string } | null;
  transport_variants: {
    id: number;
    code: string;
    name: string;
    fare_model: "distance" | "matrix";
  } | null;
  route_stops: AdminRouteStop[];
}

export interface AdminTransitPointRecord {
  id: number;
  name: string;
  description?: string | null;
  stop_type?: "road_stop" | "train_station" | null;
  latitude: number;
  longitude: number;
  transport_type_id: number | null;
  is_active: boolean | null;
  is_approved: boolean | null;
  is_banned: boolean | null;
  is_deleted: boolean | null;
  moderation_status: "pending" | "approved" | "rejected";
  moderation_note: string | null;
  transport_types: { name: string; color: string } | null;
}

export interface AdminTransportTypeRecord {
  id: number;
  name: string;
  color: string;
}

export interface AdminRouteManagementData {
  routes: AdminRouteRecord[];
  stops: AdminTransitPointRecord[];
  terminals: AdminTransitPointRecord[];
  transportTypes: AdminTransportTypeRecord[];
}

export interface AdminUserRecord {
  id: string;
  email: string | null;
  username: string | null;
  createdAt: string;
  role: "registered_user" | "moderator";
  banned?: boolean;
}

export interface AdminReportRecord {
  id: number;
  type: "Post" | "Comment" | "User";
  targetType: "post" | "comment" | "user";
  postId: string | null;
  commentId: string | null;
  reportedUserId: string | null;
  reason: string;
  reportedContent: string;
  reporter: string;
  reportedUser: string;
  date: string;
  status: "Pending" | "Reviewed" | "Dismissed";
  description: string;
}

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

export interface AdminRouteStopPayload {
  kind: "terminal" | "stop";
  id: number;
}

export interface AdminRouteUpdatePayload {
  name?: string;
  transportTypeId?: number;
  variantId?: number;
  moderationStatus?: "pending" | "approved" | "rejected";
  moderationNote?: string | null;
  isActive?: boolean;
  stops?: AdminRouteStopPayload[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isNullableRecord(
  value: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
): boolean {
  return value === null || (isRecord(value) && predicate(value));
}

function isRoutePoint(value: unknown): value is AdminRoutePoint {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.id) &&
    typeof value.name === "string" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    (value.is_approved === null || typeof value.is_approved === "boolean")
  );
}

function isAdminRouteStop(value: unknown): value is AdminRouteStop {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.route_id) ||
    !isNonNegativeInteger(value.stop_order)
  ) {
    return false;
  }

  const isStopRecord = (record: Record<string, unknown>) =>
    isRoutePoint(record) &&
    isNullableString(record.description) &&
    (record.stop_type === null ||
      record.stop_type === "road_stop" ||
      record.stop_type === "train_station");

  return (
    isNullableRecord(value.terminals, isRoutePoint) &&
    isNullableRecord(value.stops, isStopRecord)
  );
}

function isAdminRouteRecord(value: unknown): value is AdminRouteRecord {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.id) ||
    typeof value.name !== "string" ||
    !isNonNegativeInteger(value.transport_type_id) ||
    !(value.fare_area_id === null || isNonNegativeInteger(value.fare_area_id)) ||
    typeof value.is_active !== "boolean" ||
    typeof value.is_approved !== "boolean" ||
    typeof value.is_banned !== "boolean" ||
    typeof value.is_deleted !== "boolean" ||
    !["pending", "approved", "rejected"].includes(
      String(value.moderation_status),
    ) ||
    !Array.isArray(value.route_stops) ||
    !value.route_stops.every(isAdminRouteStop)
  ) {
    return false;
  }

  const isTransportType = (record: Record<string, unknown>) =>
    typeof record.name === "string" && typeof record.color === "string";

  const isTransportVariant = (record: Record<string, unknown>) =>
    isNonNegativeInteger(record.id) &&
    typeof record.code === "string" &&
    typeof record.name === "string" &&
    (record.fare_model === "distance" || record.fare_model === "matrix");

  return (
    isNullableRecord(value.transport_types, isTransportType) &&
    isNullableRecord(value.transport_variants, isTransportVariant)
  );
}

function isAdminTransitPointRecord(
  value: unknown,
): value is AdminTransitPointRecord {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.id) ||
    typeof value.name !== "string" ||
    !(value.description === undefined || isNullableString(value.description)) ||
    !(
      value.stop_type === undefined ||
      value.stop_type === null ||
      value.stop_type === "road_stop" ||
      value.stop_type === "train_station"
    ) ||
    typeof value.latitude !== "number" ||
    !Number.isFinite(value.latitude) ||
    typeof value.longitude !== "number" ||
    !Number.isFinite(value.longitude) ||
    !(value.transport_type_id === null || isNonNegativeInteger(value.transport_type_id)) ||
    !isNullableBoolean(value.is_active) ||
    !isNullableBoolean(value.is_approved) ||
    !isNullableBoolean(value.is_banned) ||
    !isNullableBoolean(value.is_deleted) ||
    !["pending", "approved", "rejected"].includes(
      String(value.moderation_status),
    ) ||
    !isNullableString(value.moderation_note)
  ) {
    return false;
  }

  return isNullableRecord(
    value.transport_types,
    (record) =>
      typeof record.name === "string" && typeof record.color === "string",
  );
}

function isAdminTransportTypeRecord(
  value: unknown,
): value is AdminTransportTypeRecord {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.id) &&
    typeof value.name === "string" &&
    typeof value.color === "string"
  );
}

function isNullableCount(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isAdminReportRecord(value: unknown): value is AdminReportRecord {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    (value.type === "Post" ||
      value.type === "Comment" ||
      value.type === "User") &&
    (value.targetType === "post" ||
      value.targetType === "comment" ||
      value.targetType === "user") &&
    isNullableString(value.postId) &&
    isNullableString(value.commentId) &&
    isNullableString(value.reportedUserId) &&
    typeof value.reason === "string" &&
    typeof value.reportedContent === "string" &&
    typeof value.reporter === "string" &&
    typeof value.reportedUser === "string" &&
    typeof value.date === "string" &&
    (value.status === "Pending" ||
      value.status === "Reviewed" ||
      value.status === "Dismissed") &&
    typeof value.description === "string"
  );
}

function isAdminNotificationRecord(
  value: unknown,
): value is AdminNotificationRecord {
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

function isRecentActivityItem(
  value: unknown,
): value is AdminRecentActivityItem {
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

function isNullableRecentActivity(
  value: unknown,
): value is AdminRecentActivityItem[] | null {
  return (
    value === null ||
    (Array.isArray(value) && value.every(isRecentActivityItem))
  );
}

function parseAdminSummary(value: unknown): AdminSummary {
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

function parseAdminRoutes(value: unknown): AdminRouteRecord[] {
  if (!Array.isArray(value) || !value.every(isAdminRouteRecord)) {
    throw new Error("Admin service returned an invalid response.");
  }

  return value;
}

function parseAdminUsers(value: unknown): AdminUserRecord[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (user) =>
        isRecord(user) &&
        typeof user.id === "string" &&
        isNullableString(user.email) &&
        isNullableString(user.username) &&
        typeof user.createdAt === "string" &&
        (user.role === "registered_user" || user.role === "moderator"),
    )
  ) {
    throw new Error("Admin service returned an invalid response.");
  }

  return value;
}

function parseAdminNotifications(value: unknown): AdminNotificationList {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.unreadCount) ||
    !Array.isArray(value.notifications) ||
    !value.notifications.every(isAdminNotificationRecord)
  ) {
    throw new Error("Admin service returned an invalid response.");
  }

  return {
    notifications: value.notifications,
    unreadCount: value.unreadCount,
  };
}

async function requestApi(
  basePath: string,
  path: string,
  expectedUserId: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<Record<string, unknown>> {
  const serviceName =
    basePath === "/api/admin" ? "Admin" : "Route Management";
  const { data, error } = await supabase.auth.getSession();

  if (error) throw new Error(error.message);

  const session = data.session;

  if (!session?.access_token) {
    throw new Error("Please sign in to continue.");
  }

  if (session.user.id !== expectedUserId) {
    throw new Error("The active account changed. Please try again.");
  }

  const response = await fetch(`${API_BASE_URL}${basePath}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`${serviceName} request failed (HTTP ${response.status}).`);
    }

    throw new Error(`${serviceName} service returned an invalid response.`);
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `${serviceName} request failed (HTTP ${response.status}).`;

    throw new Error(message);
  }

  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`${serviceName} service returned an invalid response.`);
  }

  return payload;
}

function requestAdmin(
  path: string,
  expectedUserId: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<Record<string, unknown>> {
  return requestApi("/api/admin", path, expectedUserId, options);
}

function requestRouteManagement(
  path: string,
  expectedUserId: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<Record<string, unknown>> {
  return requestApi("/api/route-management", path, expectedUserId, options);
}

export async function getAdminSummary(
  expectedUserId: string,
): Promise<AdminSummary> {
  const payload = await requestAdmin("/summary", expectedUserId);
  return parseAdminSummary(payload.summary);
}

export async function getAdminRoutes(
  expectedUserId: string,
): Promise<AdminRouteRecord[]> {
  const payload = await requestAdmin("/routes", expectedUserId);
  return parseAdminRoutes(payload.routes);
}

export async function getRouteManagementData(
  expectedUserId: string,
): Promise<AdminRouteManagementData> {
  const payload = await requestRouteManagement("/", expectedUserId);
  if (
    !isRecord(payload.records) ||
    !Array.isArray(payload.records.routes) ||
    !payload.records.routes.every(isAdminRouteRecord) ||
    !Array.isArray(payload.records.stops) ||
    !payload.records.stops.every(isAdminTransitPointRecord) ||
    !Array.isArray(payload.records.terminals) ||
    !payload.records.terminals.every(isAdminTransitPointRecord) ||
    !Array.isArray(payload.records.transportTypes) ||
    !payload.records.transportTypes.every(isAdminTransportTypeRecord)
  ) {
    throw new Error("Route Management returned an invalid response.");
  }

  return {
    routes: payload.records.routes,
    stops: payload.records.stops,
    terminals: payload.records.terminals,
    transportTypes: payload.records.transportTypes,
  };
}

export type RouteManagementEntityType = "route" | "stop" | "terminal";

export async function moderateRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
  action: "approve" | "reject",
  moderationNote?: string,
): Promise<void> {
  await requestRouteManagement(`/moderation/${entityType}/${id}`, expectedUserId, {
    method: "POST",
    body: { action, ...(moderationNote ? { moderation_note: moderationNote } : {}) },
  });
}

export async function updateRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
  payload: Record<string, unknown>,
): Promise<void> {
  await requestRouteManagement(`/records/${entityType}/${id}`, expectedUserId, {
    method: "PATCH",
    body: payload,
  });
}

export async function archiveRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
): Promise<void> {
  await requestRouteManagement(`/records/${entityType}/${id}`, expectedUserId, {
    method: "DELETE",
  });
}

export async function createAdminTransportType(
  expectedUserId: string,
  name: string,
  color: string,
): Promise<void> {
  await requestRouteManagement("/transport-types", expectedUserId, {
    method: "POST",
    body: { name, color },
  });
}

export async function updateAdminTransportType(
  expectedUserId: string,
  id: number,
  name: string,
  color: string,
): Promise<void> {
  await requestRouteManagement(`/transport-types/${id}`, expectedUserId, {
    method: "PATCH",
    body: { name, color },
  });
}

export async function getAdminUsers(
  expectedUserId: string,
): Promise<AdminUserRecord[]> {
  const payload = await requestAdmin("/users", expectedUserId);
  return parseAdminUsers(payload.users);
}

export async function getAdminCommunityPosts(
  expectedUserId: string,
): Promise<CommunityPost[]> {
  const payload = await requestAdmin("/posts", expectedUserId);

  if (!Array.isArray(payload.posts)) {
    throw new Error("Admin service returned invalid community post data.");
  }

  return payload.posts as CommunityPost[];
}

export async function getAdminReports(
  expectedUserId: string,
): Promise<AdminReportRecord[]> {
  const payload = await requestAdmin("/reports", expectedUserId);

  if (
    !Array.isArray(payload.reports) ||
    !payload.reports.every(isAdminReportRecord)
  ) {
    throw new Error("Admin service returned invalid reports data.");
  }

  return payload.reports;
}

export async function updateAdminReportStatus(
  expectedUserId: string,
  id: number,
  status: "Pending" | "Reviewed" | "Dismissed",
): Promise<void> {
  await requestAdmin(`/reports/${id}`, expectedUserId, {
    method: "PATCH",
    body: { status },
  });
}

export async function deleteAdminCommunityPost(
  expectedUserId: string,
  id: string,
): Promise<void> {
  await requestAdmin(`/posts/${id}`, expectedUserId, {
    method: "DELETE",
  });
}

export async function toggleAdminUserBan(
  expectedUserId: string,
  id: string,
  ban: boolean,
): Promise<void> {
  await requestAdmin(`/users/${id}/ban`, expectedUserId, {
    method: "PATCH",
    body: { ban },
  });
}

export async function setAdminUserRole(
  expectedUserId: string,
  id: string,
  role: AdminUserRecord["role"],
): Promise<void> {
  await requestAdmin(`/users/${id}/role`, expectedUserId, {
    method: "PATCH",
    body: { role },
  });
}

export async function updateAdminRoute(
  expectedUserId: string,
  routeId: number,
  payload: AdminRouteUpdatePayload,
): Promise<void> {
  await requestAdmin(`/routes/${routeId}`, expectedUserId, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAdminRoute(
  expectedUserId: string,
  routeId: number,
): Promise<void> {
  await requestAdmin(`/routes/${routeId}`, expectedUserId, {
    method: "DELETE",
  });
}

export async function getAdminUnreadNotificationCount(
  expectedUserId: string,
): Promise<number> {
  const payload = await requestAdmin(
    "/notifications/unread-count",
    expectedUserId,
  );

  if (!isNonNegativeInteger(payload.unreadCount)) {
    throw new Error("Admin service returned an invalid response.");
  }

  return payload.unreadCount;
}

export async function getAdminNotifications(
  expectedUserId: string,
): Promise<AdminNotificationList> {
  const payload = await requestAdmin("/notifications", expectedUserId);
  return parseAdminNotifications(payload);
}

export async function markAdminNotificationRead(
  expectedUserId: string,
  notificationId: string,
): Promise<void> {
  await requestAdmin(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    expectedUserId,
    { method: "PATCH" },
  );
}

export async function setAdminPostVisibility(
  expectedUserId: string,
  postId: string,
  isHidden: boolean,
): Promise<void> {
  await requestAdmin(
    `/posts/${encodeURIComponent(postId)}/visibility`,
    expectedUserId,
    { method: "PATCH", body: { isHidden } },
  );
}
