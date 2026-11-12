import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export interface AdminRecentActivityItem {
  kind: "report" | "post";
  title: string;
  detail: string;
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
  transport_types: { name: string; color: string } | null;
  transport_variants: {
    id: number;
    code: string;
    name: string;
    fare_model: "distance" | "matrix";
  } | null;
  route_stops: AdminRouteStop[];
}

export interface AdminUserRecord {
  id: string;
  email: string | null;
  username: string | null;
  createdAt: string;
  banned?: boolean;
}

export interface AdminReportRecord {
  id: number;
  type: "Post" | "User" | "Route" | "General";
  reason: string;
  reportedContent: string;
  reporter: string;
  reportedUser: string;
  date: string;
  status: "Pending" | "Reviewed" | "Dismissed";
  description: string;
}

export interface AdminRouteStopPayload {
  kind: "terminal" | "stop";
  id: number;
}

export interface AdminRouteCreatePayload {
  name: string;
  transportTypeId: number;
  variantId: number;
  stops: AdminRouteStopPayload[];
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

function isNullableCount(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isRecentActivityItem(
  value: unknown,
): value is AdminRecentActivityItem {
  return (
    isRecord(value) &&
    (value.kind === "report" || value.kind === "post") &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
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
        typeof user.createdAt === "string",
    )
  ) {
    throw new Error("Admin service returned an invalid response.");
  }
  return value;
}

async function requestAdmin(
  path: string,
  expectedUserId: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const session = data.session;
  if (!session?.access_token) {
    throw new Error("Please sign in to continue.");
  }
  if (session.user.id !== expectedUserId) {
    throw new Error("The active account changed. Please try again.");
  }

  const response = await fetch(`${API_BASE_URL}/api/admin${path}`, {
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
      throw new Error(`Admin request failed (HTTP ${response.status}).`);
    }
    throw new Error("Admin service returned an invalid response.");
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `Admin request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error("Admin service returned an invalid response.");
  }
  return payload;
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

export async function getAdminUsers(
  expectedUserId: string,
): Promise<AdminUserRecord[]> {
  const payload = await requestAdmin("/users", expectedUserId);
  return parseAdminUsers(payload.users);
}

export async function getAdminReports(
  expectedUserId: string,
): Promise<AdminReportRecord[]> {
  const payload = await requestAdmin("/reports", expectedUserId);
  if (!Array.isArray(payload.reports)) {
    throw new Error("Admin service returned invalid reports data.");
  }
  return payload.reports as AdminReportRecord[];
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

export async function createAdminRoute(
  expectedUserId: string,
  payload: AdminRouteCreatePayload,
): Promise<number> {
  const response = await requestAdmin("/routes", expectedUserId, {
    method: "POST",
    body: payload,
  });
  if (
    !isRecord(response.route) ||
    !isNonNegativeInteger(response.route.id)
  ) {
    throw new Error("Admin service returned an invalid response.");
  }
  return response.route.id;
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
