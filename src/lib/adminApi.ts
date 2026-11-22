import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { CommunityPost } from "@/lib/community";

/* -------------------------------------------------------------------------- */
/*                                 ADMIN TYPES                                */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                               ROUTE TYPES                                  */
/* -------------------------------------------------------------------------- */

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
  stops:
    | (AdminRoutePoint & {
        description: string | null;
        stop_type: "road_stop" | "train_station" | null;
      })
    | null;
}

export interface AdminRouteRecord {
  id: number;
  name: string;
  transport_type_id: number;
  is_active: boolean;
  is_approved: boolean;
  is_banned: boolean;
  is_deleted: boolean;
  moderation_status: "pending" | "approved" | "rejected";
  moderation_note?: string | null;
  transport_types: {
    name: string;
    color: string;
  } | null;
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
  transport_types: {
    name: string;
    color: string;
  } | null;
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

export type RouteManagementEntityType =
  | "route"
  | "stop"
  | "terminal";

/* -------------------------------------------------------------------------- */
/*                              USER MANAGEMENT                              */
/* -------------------------------------------------------------------------- */

export type AdminUserRole =
  | "registered_user"
  | "admin";

export type AdminUserRestrictionAction =
  | "mute"
  | "unmute"
  | "ban_temporary"
  | "ban_permanent"
  | "unban";

export type AdminUserManagementStatus =
  | "all"
  | "active"
  | "muted"
  | "banned"
  | "deleted";

export type AdminUserPageSize =
  | 10
  | 25
  | 50
  | 100;

/**
 * The username is returned only for internal search matching.
 *
 * Do not render searchUsername in User Management.
 *
 * profilePhotoUrl is resolved by the backend:
 *
 * 1. Uploaded photo from profile-photos/{userId}/profile.
 * 2. Google profile photo metadata.
 * 3. null, which allows the frontend to use its default avatar.
 */
export interface AdminUserRecord {
  id: string;
  email: string | null;
  displayName: string;
  searchUsername: string | null;
  createdAt: string;

  role: AdminUserRole;
  isDeleted: boolean;

  profilePhotoUrl: string | null;

  isBanned: boolean;
  isMuted: boolean;
  isPermanentBan: boolean;

  banExpiresAt: string | null;
  muteExpiresAt: string | null;

  banReason: string | null;
  muteReason: string | null;

  /**
   * Indicates whether the Supabase Auth ban state matches
   * the database moderation state.
   *
   * This is informational. It is not a general-purpose
   * synchronization/retry action.
   */
  authBanSynced: boolean;
}

/**
 * Parameters for the paginated User Management endpoint.
 *
 * Defaults:
 * - page: 1
 * - pageSize: 25
 * - search: ""
 * - status: "all"
 */
export interface AdminUsersPageRequest {
  page?: number;
  pageSize?: AdminUserPageSize;
  search?: string;
  status?: AdminUserManagementStatus;
}

/**
 * Paginated result returned by:
 *
 * GET /api/admin/users
 */
export interface AdminUsersPage {
  users: AdminUserRecord[];
  totalCount: number;
  page: number;
  pageSize: AdminUserPageSize;
  totalPages: number;
}

/**
 * Payload accepted by:
 *
 * POST /api/admin/users/:id/restrictions
 *
 * For mute:
 * - durationSeconds: null or omitted means indefinite mute.
 * - A positive duration creates a temporary mute.
 *
 * For ban_temporary:
 * - durationSeconds is required.
 *
 * For ban_permanent:
 * - durationSeconds is not needed.
 *
 * For unmute and unban:
 * - reason is optional.
 */
export interface AdminUserRestrictionPayload {
  action: AdminUserRestrictionAction;
  durationSeconds?: number | null;
  reason?: string;
}

/**
 * Matches the actual AdminUserModerationHistoryItem returned
 * by server/admin.ts.
 *
 * The backend returns description and metadata,
 * not category and detail.
 */
export interface AdminUserModerationHistoryItem {
  id: string;
  actionKey: string;
  title: string;
  description: string;
  adminDisplayName: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*                                 REPORT TYPES                               */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                              NOTIFICATION TYPES                           */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                              API ERROR TYPE                                */
/* -------------------------------------------------------------------------- */

/**
 * Preserves useful HTTP response information for frontend handling.
 *
 * In particular, restrictionSaved tells the UI whether the database
 * restriction was successfully saved even though Auth synchronization
 * subsequently failed.
 */
export class AdminApiError extends Error {
  readonly status: number;
  readonly restrictionSaved: boolean;

  constructor(
    message: string,
    status: number,
    restrictionSaved = false,
  ) {
    super(message);

    this.name = "AdminApiError";
    this.status = status;
    this.restrictionSaved = restrictionSaved;
  }
}

/* -------------------------------------------------------------------------- */
/*                              VALIDATION HELPERS                            */
/* -------------------------------------------------------------------------- */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonNegativeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isPositiveInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

function isNullableString(
  value: unknown,
): value is string | null {
  return (
    value === null ||
    typeof value === "string"
  );
}

function isNullableBoolean(
  value: unknown,
): value is boolean | null {
  return (
    value === null ||
    typeof value === "boolean"
  );
}

function isNullableRecord(
  value: unknown,
  predicate: (
    record: Record<string, unknown>,
  ) => boolean,
): boolean {
  return (
    value === null ||
    (isRecord(value) && predicate(value))
  );
}

function isNullableCount(
  value: unknown,
): value is number | null {
  return (
    value === null ||
    isNonNegativeInteger(value)
  );
}

/**
 * Profile photo URLs must be valid HTTPS URLs.
 *
 * This accepts both:
 * - Supabase public Storage URLs.
 * - Google profile photo URLs.
 */
function isNullableHttpsUrl(
  value: unknown,
): value is string | null {
  if (value === null) {
    return true;
  }

  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isAdminUserPageSize(
  value: unknown,
): value is AdminUserPageSize {
  return (
    value === 10 ||
    value === 25 ||
    value === 50 ||
    value === 100
  );
}

function isAdminUserManagementStatus(
  value: unknown,
): value is AdminUserManagementStatus {
  return (
    value === "all" ||
    value === "active" ||
    value === "muted" ||
    value === "banned" ||
    value === "deleted"
  );
}

/* -------------------------------------------------------------------------- */
/*                            ROUTE VALIDATORS                                */
/* -------------------------------------------------------------------------- */

function isRoutePoint(
  value: unknown,
): value is AdminRoutePoint {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.id) &&
    typeof value.name === "string" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    (
      value.is_approved === null ||
      typeof value.is_approved === "boolean"
    )
  );
}

function isAdminRouteStop(
  value: unknown,
): value is AdminRouteStop {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.route_id) ||
    !isNonNegativeInteger(value.stop_order)
  ) {
    return false;
  }

  const isStopRecord = (
    record: Record<string, unknown>,
  ) =>
    isRoutePoint(record) &&
    isNullableString(record.description) &&
    (
      record.stop_type === null ||
      record.stop_type === "road_stop" ||
      record.stop_type === "train_station"
    );

  return (
    isNullableRecord(
      value.terminals,
      isRoutePoint,
    ) &&
    isNullableRecord(
      value.stops,
      isStopRecord,
    )
  );
}

function isAdminRouteRecord(
  value: unknown,
): value is AdminRouteRecord {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.id) ||
    typeof value.name !== "string" ||
    !isNonNegativeInteger(value.transport_type_id) ||
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

  const isTransportType = (
    record: Record<string, unknown>,
  ) =>
    typeof record.name === "string" &&
    typeof record.color === "string";

  const isTransportVariant = (
    record: Record<string, unknown>,
  ) =>
    isNonNegativeInteger(record.id) &&
    typeof record.code === "string" &&
    typeof record.name === "string" &&
    (
      record.fare_model === "distance" ||
      record.fare_model === "matrix"
    );

  return (
    isNullableRecord(
      value.transport_types,
      isTransportType,
    ) &&
    isNullableRecord(
      value.transport_variants,
      isTransportVariant,
    )
  );
}

function isAdminTransitPointRecord(
  value: unknown,
): value is AdminTransitPointRecord {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.id) ||
    typeof value.name !== "string" ||
    !(
      value.description === undefined ||
      isNullableString(value.description)
    ) ||
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
    !(
      value.transport_type_id === null ||
      isNonNegativeInteger(value.transport_type_id)
    ) ||
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
      typeof record.name === "string" &&
      typeof record.color === "string",
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

/* -------------------------------------------------------------------------- */
/*                            USER VALIDATORS                                 */
/* -------------------------------------------------------------------------- */

function isAdminUserRecord(
  value: unknown,
): value is AdminUserRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isNullableString(value.email) &&
    typeof value.displayName === "string" &&
    isNullableString(value.searchUsername) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(new Date(value.createdAt).getTime()) &&
    (
      value.role === "registered_user" ||
      value.role === "admin"
    ) &&
    typeof value.isDeleted === "boolean" &&
    isNullableHttpsUrl(value.profilePhotoUrl) &&
    typeof value.isBanned === "boolean" &&
    typeof value.isMuted === "boolean" &&
    typeof value.isPermanentBan === "boolean" &&
    isNullableString(value.banExpiresAt) &&
    isNullableString(value.muteExpiresAt) &&
    isNullableString(value.banReason) &&
    isNullableString(value.muteReason) &&
    typeof value.authBanSynced === "boolean"
  );
}

function isAdminUserModerationHistoryItem(
  value: unknown,
): value is AdminUserModerationHistoryItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.actionKey === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.adminDisplayName === "string" &&
    typeof value.occurredAt === "string" &&
    Number.isFinite(
      new Date(value.occurredAt).getTime(),
    ) &&
    isRecord(value.metadata)
  );
}

/* -------------------------------------------------------------------------- */
/*                           REPORT VALIDATORS                                */
/* -------------------------------------------------------------------------- */

function isAdminReportRecord(
  value: unknown,
): value is AdminReportRecord {
  return (
    isRecord(value) &&
    isPositiveInteger(value.id) &&
    (
      value.type === "Post" ||
      value.type === "Comment" ||
      value.type === "User"
    ) &&
    (
      value.targetType === "post" ||
      value.targetType === "comment" ||
      value.targetType === "user"
    ) &&
    isNullableString(value.postId) &&
    isNullableString(value.commentId) &&
    isNullableString(value.reportedUserId) &&
    typeof value.reason === "string" &&
    typeof value.reportedContent === "string" &&
    typeof value.reporter === "string" &&
    typeof value.reportedUser === "string" &&
    typeof value.date === "string" &&
    (
      value.status === "Pending" ||
      value.status === "Reviewed" ||
      value.status === "Dismissed"
    ) &&
    typeof value.description === "string"
  );
}

/* -------------------------------------------------------------------------- */
/*                         NOTIFICATION VALIDATORS                            */
/* -------------------------------------------------------------------------- */

function isAdminNotificationRecord(
  value: unknown,
): value is AdminNotificationRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.postId === "string" &&
    value.postId.length > 0 &&
    (
      value.reportId === null ||
      isPositiveInteger(value.reportId)
    ) &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.isRead === "boolean"
  );
}

/* -------------------------------------------------------------------------- */
/*                         SUMMARY VALIDATORS                                 */
/* -------------------------------------------------------------------------- */

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
    (
      Array.isArray(value) &&
      value.every(isRecentActivityItem)
    )
  );
}

/* -------------------------------------------------------------------------- */
/*                              RESPONSE PARSERS                              */
/* -------------------------------------------------------------------------- */

function parseAdminSummary(
  value: unknown,
): AdminSummary {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.registeredUsers) ||
    !isNonNegativeInteger(value.routes) ||
    !isNonNegativeInteger(value.communityPosts) ||
    !isNullableCount(value.reports) ||
    !isNullableRecentActivity(value.recentActivity)
  ) {
    throw new Error(
      "Admin service returned an invalid response.",
    );
  }

  return {
    registeredUsers: value.registeredUsers,
    routes: value.routes,
    communityPosts: value.communityPosts,
    reports: value.reports,
    recentActivity: value.recentActivity,
  };
}

function parseAdminRoutes(
  value: unknown,
): AdminRouteRecord[] {
  if (
    !Array.isArray(value) ||
    !value.every(isAdminRouteRecord)
  ) {
    throw new Error(
      "Admin service returned an invalid response.",
    );
  }

  return value as AdminRouteRecord[];
}

/**
 * Validates the paginated user response returned by:
 *
 * GET /api/admin/users
 */
function parseAdminUsersPage(
  value: unknown,
  requestedPageSize: AdminUserPageSize,
): AdminUsersPage {
  if (!isRecord(value)) {
    throw new Error(
      "Admin service returned invalid user pagination data.",
    );
  }

  const rawUsers = value.users;
  const totalCount = value.totalCount;
  const page = value.page;
  const pageSize = value.pageSize;
  const totalPages = value.totalPages;

  if (
    !Array.isArray(rawUsers) ||
    !rawUsers.every(isAdminUserRecord) ||
    !isNonNegativeInteger(totalCount) ||
    !isPositiveInteger(page) ||
    !isAdminUserPageSize(pageSize) ||
    pageSize !== requestedPageSize ||
    !isNonNegativeInteger(totalPages)
  ) {
    throw new Error(
      "Admin service returned invalid user pagination data.",
    );
  }

  const expectedTotalPages =
    totalCount === 0
      ? 0
      : Math.ceil(totalCount / pageSize);

  if (
    totalPages !== expectedTotalPages ||
    (
      totalPages === 0
        ? page !== 1
        : page > totalPages
    ) ||
    rawUsers.length > pageSize ||
    (
      totalCount === 0 &&
      rawUsers.length !== 0
    )
  ) {
    throw new Error(
      "Admin service returned inconsistent user pagination information.",
    );
  }

  return {
    users: rawUsers as AdminUserRecord[],
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

function parseAdminUserModerationHistory(
  value: unknown,
): AdminUserModerationHistoryItem[] {
  if (
    !Array.isArray(value) ||
    !value.every(isAdminUserModerationHistoryItem)
  ) {
    throw new Error(
      "Admin service returned invalid moderation history.",
    );
  }

  return value as AdminUserModerationHistoryItem[];
}

function parseAdminNotifications(
  value: unknown,
): AdminNotificationList {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.unreadCount) ||
    !Array.isArray(value.notifications) ||
    !value.notifications.every(
      isAdminNotificationRecord,
    )
  ) {
    throw new Error(
      "Admin service returned an invalid response.",
    );
  }

  return {
    notifications:
      value.notifications as AdminNotificationRecord[],
    unreadCount: value.unreadCount,
  };
}

/* -------------------------------------------------------------------------- */
/*                               REQUEST HANDLER                              */
/* -------------------------------------------------------------------------- */

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
    basePath === "/api/admin"
      ? "Admin"
      : "Route Management";

  const { data, error } =
    await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  const session = data.session;

  if (!session?.access_token) {
    throw new Error(
      "Please sign in to continue.",
    );
  }

  if (session.user.id !== expectedUserId) {
    throw new Error(
      "The active account changed. Please try again.",
    );
  }

  const hasBody =
    options?.body !== undefined;

  const response = await fetch(
    `${API_BASE_URL}${basePath}${path}`,
    {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(hasBody
          ? {
              "Content-Type": "application/json",
            }
          : {}),
      },
      ...(hasBody
        ? {
            body: JSON.stringify(options.body),
          }
        : {}),
    },
  );

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new AdminApiError(
        `${serviceName} request failed (HTTP ${response.status}).`,
        response.status,
      );
    }

    throw new Error(
      `${serviceName} service returned an invalid response.`,
    );
  }

  if (!response.ok) {
    const message =
      isRecord(payload) &&
      typeof payload.message === "string"
        ? payload.message
        : `${serviceName} request failed (HTTP ${response.status}).`;

    const restrictionSaved =
      isRecord(payload) &&
      payload.restrictionSaved === true;

    throw new AdminApiError(
      message,
      response.status,
      restrictionSaved,
    );
  }

  if (
    !isRecord(payload) ||
    payload.success !== true
  ) {
    throw new Error(
      `${serviceName} service returned an invalid response.`,
    );
  }

  return payload;
}

/* -------------------------------------------------------------------------- */
/*                          REQUEST SHORTCUTS                                 */
/* -------------------------------------------------------------------------- */

function requestAdmin(
  path: string,
  expectedUserId: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<Record<string, unknown>> {
  return requestApi(
    "/api/admin",
    path,
    expectedUserId,
    options,
  );
}

function requestRouteManagement(
  path: string,
  expectedUserId: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<Record<string, unknown>> {
  return requestApi(
    "/api/route-management",
    path,
    expectedUserId,
    options,
  );
}

/* -------------------------------------------------------------------------- */
/*                              ADMIN SUMMARY                                 */
/* -------------------------------------------------------------------------- */

export async function getAdminSummary(
  expectedUserId: string,
): Promise<AdminSummary> {
  const payload = await requestAdmin(
    "/summary",
    expectedUserId,
  );

  return parseAdminSummary(payload.summary);
}

/* -------------------------------------------------------------------------- */
/*                              ADMIN ROUTES                                  */
/* -------------------------------------------------------------------------- */

export async function getAdminRoutes(
  expectedUserId: string,
): Promise<AdminRouteRecord[]> {
  const payload = await requestAdmin(
    "/routes",
    expectedUserId,
  );

  return parseAdminRoutes(payload.routes);
}

/* -------------------------------------------------------------------------- */
/*                         ROUTE MANAGEMENT DATA                              */
/* -------------------------------------------------------------------------- */

export async function getRouteManagementData(
  expectedUserId: string,
): Promise<AdminRouteManagementData> {
  const payload = await requestRouteManagement(
    "/",
    expectedUserId,
  );

  if (
    !isRecord(payload.records) ||
    !Array.isArray(payload.records.routes) ||
    !payload.records.routes.every(isAdminRouteRecord) ||
    !Array.isArray(payload.records.stops) ||
    !payload.records.stops.every(
      isAdminTransitPointRecord,
    ) ||
    !Array.isArray(payload.records.terminals) ||
    !payload.records.terminals.every(
      isAdminTransitPointRecord,
    ) ||
    !Array.isArray(payload.records.transportTypes) ||
    !payload.records.transportTypes.every(
      isAdminTransportTypeRecord,
    )
  ) {
    throw new Error(
      "Route Management returned an invalid response.",
    );
  }

  return {
    routes:
      payload.records.routes as AdminRouteRecord[],
    stops:
      payload.records.stops as AdminTransitPointRecord[],
    terminals:
      payload.records.terminals as AdminTransitPointRecord[],
    transportTypes:
      payload.records.transportTypes as AdminTransportTypeRecord[],
  };
}

/* -------------------------------------------------------------------------- */
/*                         ROUTE MANAGEMENT ACTIONS                           */
/* -------------------------------------------------------------------------- */

export async function moderateRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
  action:
    | "approve"
    | "reject"
    | "mute"
    | "unmute"
    | "ban"
    | "unban",
  moderationNote?: string,
): Promise<void> {
  await requestRouteManagement(
    `/moderation/${entityType}/${id}`,
    expectedUserId,
    {
      method: "POST",
      body: {
        action,
        ...(moderationNote
          ? {
              moderation_note: moderationNote,
            }
          : {}),
      },
    },
  );
}

export async function updateRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
  payload: Record<string, unknown>,
): Promise<void> {
  await requestRouteManagement(
    `/records/${entityType}/${id}`,
    expectedUserId,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function archiveRouteManagementRecord(
  expectedUserId: string,
  entityType: RouteManagementEntityType,
  id: number,
): Promise<void> {
  await requestRouteManagement(
    `/records/${entityType}/${id}`,
    expectedUserId,
    {
      method: "DELETE",
    },
  );
}

export async function createAdminTransportType(
  expectedUserId: string,
  name: string,
  color: string,
): Promise<void> {
  await requestRouteManagement(
    "/transport-types",
    expectedUserId,
    {
      method: "POST",
      body: {
        name,
        color,
      },
    },
  );
}

export async function updateAdminTransportType(
  expectedUserId: string,
  id: number,
  name: string,
  color: string,
): Promise<void> {
  await requestRouteManagement(
    `/transport-types/${id}`,
    expectedUserId,
    {
      method: "PATCH",
      body: {
        name,
        color,
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                              USER MANAGEMENT                              */
/* -------------------------------------------------------------------------- */

/**
 * Retrieves one page of administrator-managed accounts.
 *
 * The backend performs search, status filtering, photo resolution,
 * and pagination inside the database.
 *
 * Defaults:
 * - page: 1
 * - pageSize: 25
 * - search: ""
 * - status: "all"
 */
export async function getAdminUsersPage(
  expectedUserId: string,
  options: AdminUsersPageRequest = {},
): Promise<AdminUsersPage> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  const search = options.search?.trim() ?? "";
  const status = options.status ?? "all";

  if (
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    throw new Error(
      "Page must be a positive integer.",
    );
  }

  if (!isAdminUserPageSize(pageSize)) {
    throw new Error(
      "Page size must be 10, 25, 50, or 100.",
    );
  }

  if (search.length > 100) {
    throw new Error(
      "Search text cannot exceed 100 characters.",
    );
  }

  if (!isAdminUserManagementStatus(status)) {
    throw new Error(
      "Invalid user status filter.",
    );
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search,
    status,
  });

  const payload = await requestAdmin(
    `/users?${query.toString()}`,
    expectedUserId,
  );

  return parseAdminUsersPage(
    payload,
    pageSize,
  );
}

/**
 * Changes a user's role.
 *
 * Supported roles:
 * - registered_user
 * - admin
 *
 * The backend performs authorization, deleted-account checks,
 * self-demotion protection, last-admin protection, and auditing.
 */
export async function setAdminUserRole(
  expectedUserId: string,
  id: string,
  role: AdminUserRole,
): Promise<void> {
  await requestAdmin(
    `/users/${encodeURIComponent(id)}/role`,
    expectedUserId,
    {
      method: "PATCH",
      body: {
        role,
      },
    },
  );
}

/**
 * Applies or removes a user restriction.
 *
 * Supported actions:
 * - mute
 * - unmute
 * - ban_temporary
 * - ban_permanent
 * - unban
 *
 * New restrictions require a reason.
 * Timed restrictions must be between 60 seconds and 365 days.
 *
 * The backend remains authoritative and repeats all validation.
 */
export async function applyAdminUserRestriction(
  expectedUserId: string,
  id: string,
  restriction: AdminUserRestrictionPayload,
): Promise<void> {
  const {
    action,
    durationSeconds,
    reason,
  } = restriction;

  const requiresReason =
    action === "mute" ||
    action === "ban_temporary" ||
    action === "ban_permanent";

  if (
    requiresReason &&
    (!reason || !reason.trim())
  ) {
    throw new Error(
      "A reason is required for this restriction.",
    );
  }

  if (action === "ban_temporary") {
    if (
      typeof durationSeconds !== "number" ||
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 60 ||
      durationSeconds > 365 * 24 * 60 * 60
    ) {
      throw new Error(
        "A temporary ban must be between 60 seconds and 365 days.",
      );
    }
  }

  if (
    action === "mute" &&
    durationSeconds !== undefined &&
    durationSeconds !== null &&
    (
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 60 ||
      durationSeconds > 365 * 24 * 60 * 60
    )
  ) {
    throw new Error(
      "A temporary mute must be between 60 seconds and 365 days.",
    );
  }

  if (
    action === "ban_permanent" &&
    durationSeconds !== undefined &&
    durationSeconds !== null
  ) {
    throw new Error(
      "A permanent ban must not have a duration.",
    );
  }

  if (
    action === "unmute" ||
    action === "unban"
  ) {
    if (
      durationSeconds !== undefined &&
      durationSeconds !== null
    ) {
      throw new Error(
        "A removal action must not have a duration.",
      );
    }
  }

  await requestAdmin(
    `/users/${encodeURIComponent(id)}/restrictions`,
    expectedUserId,
    {
      method: "POST",
      body: {
        action,
        durationSeconds: durationSeconds ?? null,
        ...(reason?.trim()
          ? {
              reason: reason.trim(),
            }
          : {}),
      },
    },
  );
}

/**
 * Retrieves the moderation audit history for one user.
 *
 * User-facing history should use adminDisplayName.
 * It should not display usernames.
 */
export async function getAdminUserModerationHistory(
  expectedUserId: string,
  id: string,
): Promise<AdminUserModerationHistoryItem[]> {
  const payload = await requestAdmin(
    `/users/${encodeURIComponent(id)}/moderation-history`,
    expectedUserId,
  );

  return parseAdminUserModerationHistory(
    payload.history,
  );
}

/* -------------------------------------------------------------------------- */
/*                            COMMUNITY POSTS                                */
/* -------------------------------------------------------------------------- */

export async function getAdminCommunityPosts(
  expectedUserId: string,
): Promise<CommunityPost[]> {
  const payload = await requestAdmin(
    "/posts",
    expectedUserId,
  );

  if (!Array.isArray(payload.posts)) {
    throw new Error(
      "Admin service returned invalid community post data.",
    );
  }

  return payload.posts as CommunityPost[];
}

/* -------------------------------------------------------------------------- */
/*                                  REPORTS                                   */
/* -------------------------------------------------------------------------- */

export async function getAdminReports(
  expectedUserId: string,
): Promise<AdminReportRecord[]> {
  const payload = await requestAdmin(
    "/reports",
    expectedUserId,
  );

  if (
    !Array.isArray(payload.reports) ||
    !payload.reports.every(isAdminReportRecord)
  ) {
    throw new Error(
      "Admin service returned invalid reports data.",
    );
  }

  return payload.reports as AdminReportRecord[];
}

export async function updateAdminReportStatus(
  expectedUserId: string,
  id: number,
  status: "Pending" | "Reviewed" | "Dismissed",
): Promise<void> {
  await requestAdmin(
    `/reports/${id}`,
    expectedUserId,
    {
      method: "PATCH",
      body: {
        status,
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                           COMMUNITY POST ACTIONS                           */
/* -------------------------------------------------------------------------- */

export async function deleteAdminCommunityPost(
  expectedUserId: string,
  id: string,
): Promise<void> {
  await requestAdmin(
    `/posts/${encodeURIComponent(id)}`,
    expectedUserId,
    {
      method: "DELETE",
    },
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
    {
      method: "PATCH",
      body: {
        isHidden,
      },
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                               NOTIFICATIONS                                */
/* -------------------------------------------------------------------------- */

export async function getAdminUnreadNotificationCount(
  expectedUserId: string,
): Promise<number> {
  const payload = await requestAdmin(
    "/notifications/unread-count",
    expectedUserId,
  );

  if (!isNonNegativeInteger(payload.unreadCount)) {
    throw new Error(
      "Admin service returned an invalid response.",
    );
  }

  return payload.unreadCount;
}

export async function getAdminNotifications(
  expectedUserId: string,
): Promise<AdminNotificationList> {
  const payload = await requestAdmin(
    "/notifications",
    expectedUserId,
  );

  return parseAdminNotifications(payload);
}

export async function markAdminNotificationRead(
  expectedUserId: string,
  notificationId: string,
): Promise<void> {
  await requestAdmin(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    expectedUserId,
    {
      method: "PATCH",
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                              ROUTE ACTIONS                                 */
/* -------------------------------------------------------------------------- */

export async function updateAdminRoute(
  expectedUserId: string,
  routeId: number,
  payload: AdminRouteUpdatePayload,
): Promise<void> {
  await requestAdmin(
    `/routes/${routeId}`,
    expectedUserId,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function deleteAdminRoute(
  expectedUserId: string,
  routeId: number,
): Promise<void> {
  await requestAdmin(
    `/routes/${routeId}`,
    expectedUserId,
    {
      method: "DELETE",
    },
  );
}