/* -------------------------------------------------------------------------- */
/*                            ADMIN API CONTRACTS                             */
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
/*                               ROUTE CONTRACTS                              */
/* -------------------------------------------------------------------------- */

export interface AdminRoutePoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  is_approved: boolean | null;
  moderation_status?: "pending" | "approved" | "rejected";
}

export interface AdminRouteStop {
  id: number;
  route_id: number;
  stop_order: number;
  terminal_id: number | null;
  stop_id: number | null;
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
  /** Preserved deletion state. */
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

export type RouteManagementEntityType = "route" | "stop" | "terminal";

export interface AdminRouteManagementData {
  routes: AdminRouteRecord[];
  stops: AdminTransitPointRecord[];
  terminals: AdminTransitPointRecord[];
  transportTypes: AdminTransportTypeRecord[];
  routeChangeProposals: AdminRouteChangeProposalRecord[];
}

/* -------------------------------------------------------------------------- */
/*                         ROUTE-CHANGE PROPOSALS                            */
/* -------------------------------------------------------------------------- */

export type AdminRouteChangeProposalType =
  | "insert_point"
  | "extend_route"
  | "combined"
  | "remove_points";

export type AdminRouteChangeProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "conflicted"
  | "withdrawn";

export type AdminRouteChangeProposalAction = "approve" | "reject";

/** One entry in a complete proposed route sequence. */
export interface AdminRouteChangeProposalPointRecord {
  proposal_id: number;
  /** Original canonical position in the route before approval. */
  stop_order: number;
  /** Final position after approval; zero means removal from this route. */
  proposed_stop_order: number;
  terminal_id: number | null;
  stop_id: number | null;
  is_new_point: boolean;
  is_removed_from_route: boolean;
  /** Original canonical stop_order of the point this new point replaces. */
  replaces_stop_order: number | null;
  /** Snapshot and proposed edits for an existing shared point. */
  original_name: string | null;
  original_latitude: number | null;
  original_longitude: number | null;
  proposed_name: string | null;
  proposed_latitude: number | null;
  proposed_longitude: number | null;
  terminals: AdminTransitPointRecord | null;
  stops: AdminTransitPointRecord | null;
}

/** A proposed modification to an existing approved route. */
export interface AdminRouteChangeProposalRecord {
  id: number;
  route_id: number;
  contributor_id: string | null;
  contributor_display_name: string;
  contributor_remarks: string | null;
  proposal_type: AdminRouteChangeProposalType;
  proposed_name: string | null;
  base_route_snapshot: Record<string, unknown>;
  status: AdminRouteChangeProposalStatus;
  moderation_note: string | null;
  moderated_by: string | null;
  moderator_display_name: string | null;
  moderated_at: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  route_change_proposal_points: AdminRouteChangeProposalPointRecord[];
}

/** Frontend-normalized response from route-proposal moderation. */
export interface AdminRouteChangeProposalModerationResult {
  proposalId: number;
  routeId: number;
  proposalType: AdminRouteChangeProposalType;
  status: "approved" | "rejected" | "conflicted";
  moderationNote: string | null;
  appliedAt: string | null;
  synchronization: Record<string, unknown> | null;
}

/* -------------------------------------------------------------------------- */
/*                              MAP IMAGE REVIEW                              */
/* -------------------------------------------------------------------------- */

export type AdminMapImageModerationStatus = "pending" | "approved" | "rejected";
export type AdminMapImageLocationType = "stop" | "terminal";
export type AdminMapImageModerationAction = "approve" | "reject";

export interface AdminMapImage {
  id: number;
  terminalId: number | null;
  stopId: number | null;
  caption: string | null;
  createdBy: string | null;
  createdAt: string;
  isApproved: boolean;
  moderationStatus: AdminMapImageModerationStatus;
  moderationNote: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  isBanned: boolean;
  isDeleted: boolean;
  proposalId: number | null;
  proposalStopOrder: number | null;
  /** Short-lived signed URL for an administrator-only image preview. */
  imageUrl: string | null;
}

/* -------------------------------------------------------------------------- */
/*                              USER MANAGEMENT                               */
/* -------------------------------------------------------------------------- */

export type AdminUserRole = "registered_user" | "admin";

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

export type AdminUserPageSize = 10 | 25 | 50 | 100;

/**
 * The username is returned only for internal search matching. Do not render
 * searchUsername in User Management.
 *
 * profilePhotoUrl is resolved by the backend from an uploaded profile photo,
 * Google profile photo metadata, or null for the default avatar.
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
  authBanSynced: boolean;
}

export interface AdminUsersPageRequest {
  page?: number;
  pageSize?: AdminUserPageSize;
  search?: string;
  status?: AdminUserManagementStatus;
}

export interface AdminUsersPage {
  users: AdminUserRecord[];
  totalCount: number;
  page: number;
  pageSize: AdminUserPageSize;
  totalPages: number;
}

export interface AdminUserRestrictionPayload {
  action: AdminUserRestrictionAction;
  durationSeconds?: number | null;
  reason?: string;
}

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
/*                                   REPORTS                                  */
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
/*                                NOTIFICATIONS                               */
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
