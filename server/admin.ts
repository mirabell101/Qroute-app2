
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminRouteStopInput,
  AdminRouteUpdateInput,
} from "./adminValidation.ts";

import { getRecentAdminAuditLogsWithClient } from "./adminAudit.ts";
import { getGoogleProfilePhotoUrl } from "./account.ts";

const profilePhotoBucket = "profile-photos";
const recentActivityLimit = 5;
const communityPhotoBucket = "community-post-photos";
const authBanSyncMaxAttempts = 3;
const permanentAuthBanDuration = "876000h";

export class AdminInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminInputError";
  }
}

export class AdminNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminNotFoundError";
  }
}

export class AdminForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

/**
 * The database restriction transaction has already committed,
 * but the corresponding Supabase Auth ban could not be synchronized.
 */
export class AdminAuthSyncError extends Error {
  readonly restrictionSaved = true;

  constructor(message: string) {
    super(message);
    this.name = "AdminAuthSyncError";
  }
}

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

export interface AdminUserRecord {
  id: string;

  displayName: string;
  email: string | null;

  /**
   * Internal search support only.
   * Never render searchUsername in User Management.
   */
  searchUsername: string | null;

  createdAt: string;

  role: AdminUserRole;
  isDeleted: boolean;

  profilePhotoUrl: string | null;

  // Effective database restriction states.
  isBanned: boolean;
  isMuted: boolean;
  isPermanentBan: boolean;

  banExpiresAt: string | null;
  muteExpiresAt: string | null;

  banReason: string | null;
  muteReason: string | null;

  // Database ban state versus Supabase Auth ban state.
  authBanSynced: boolean;
}

export interface AdminUsersPageRequest {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminUserManagementStatus;
}

export interface AdminUsersPage {
  users: AdminUserRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

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

// -----------------------------------------------------------------------------
// Route Management types
// -----------------------------------------------------------------------------

interface AdminRoutePoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  is_approved: boolean;
  moderation_status: "pending" | "approved" | "rejected";
}

interface AdminRouteStop {
  id: number;
  route_id: number;
  stop_order: number;
  terminal_id: number | null;
  stop_id: number | null;
  terminals: AdminRoutePoint | null;
  stops:
    | (AdminRoutePoint & {
        description: string | null;
        stop_type: "road_stop" | "train_station";
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
  moderation_note: string | null;
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

// -----------------------------------------------------------------------------
// Route-change proposal types
// -----------------------------------------------------------------------------

export type AdminRouteChangeProposalType =
  | "insert_point"
  | "extend_route";

export type AdminRouteChangeProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "conflicted"
  | "withdrawn";

/**
 * One location in the complete proposed route sequence.
 *
 * Exactly one of terminal_id or stop_id is populated.
 */
export interface AdminRouteChangeProposalPointRecord {
  proposal_id: number;
  stop_order: number;

  terminal_id: number | null;
  stop_id: number | null;

  /**
   * True when this location was created specifically
   * as part of this route-change proposal.
   */
  is_new_point: boolean;

  terminals: AdminTransitPointRecord | null;
  stops: AdminTransitPointRecord | null;
}

/**
 * A pending proposal to modify an existing approved route.
 *
 * base_route_snapshot contains the original route state
 * captured when the contributor submitted the proposal.
 *
 * route_change_proposal_points contains the complete
 * proposed ordered sequence.
 */
export interface AdminRouteChangeProposalRecord {
  id: number;
  route_id: number;

  contributor_id: string | null;
  contributor_display_name: string;

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

  route_change_proposal_points:
    AdminRouteChangeProposalPointRecord[];
}

export interface AdminTransportTypeRecord {
  id: number;
  name: string;
  color: string;
}

export interface AdminRouteManagementData {
  routes: AdminRouteRecord[];

  /**
   * Standalone stop contributions.
   *
   * Pending stops that belong to pending route-change
   * proposals are excluded from this collection.
   */
  stops: AdminTransitPointRecord[];

  /**
   * Standalone terminal contributions.
   *
   * Pending terminals that belong to pending route-change
   * proposals are excluded from this collection.
   */
  terminals: AdminTransitPointRecord[];

  transportTypes: AdminTransportTypeRecord[];

  /**
   * Complete pending route-change proposals.
   *
   * Each proposal includes its entire proposed sequence
   * and the associated stop/terminal information.
   */
  routeChangeProposals: AdminRouteChangeProposalRecord[];
}

// -----------------------------------------------------------------------------
// User Management types
// -----------------------------------------------------------------------------

/**
 * Usernames are included only for internal search matching.
 * Never render searchUsername in the User Management interface.
 */
export interface AdminUserRestrictionResult {
  userId: string;
  action: AdminUserRestrictionAction;
  isBanned: boolean;
  isMuted: boolean;
  isPermanentBan: boolean;
  banExpiresAt: string | null;
  muteExpiresAt: string | null;
  isEffectivelyBanned: boolean;
  isEffectivelyMuted: boolean;
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

// -----------------------------------------------------------------------------
// Shared internal validation and moderation helpers
// -----------------------------------------------------------------------------

function isNullableDatabaseString(
  value: unknown,
): value is string | null {
  return value === null || typeof value === "string";
}

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isValidDateString(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

interface UserBanModerationState {
  is_banned: boolean;
  is_permanent_ban: boolean;
  ban_expires_at: string | null;
}

interface UserMuteModerationState {
  is_muted: boolean;
  mute_expires_at: string | null;
}

interface UserModerationBanRow
  extends UserBanModerationState,
    UserMuteModerationState {
  user_id: string;
  ban_reason: string | null;
  mute_reason: string | null;
}

interface EffectiveBanSnapshot {
  isBanned: boolean;
  isPermanentBan: boolean;
  banExpiresAt: string | null;
}

/**
 * Mirrors public.is_user_banned().
 *
 * A null expiration on an active ban is treated as indefinite.
 * Invalid expiration data fails closed rather than silently
 * treating an uncertain restriction as expired.
 */
function isEffectiveBan(
  moderation: UserBanModerationState | null,
  now = Date.now(),
): boolean {
  if (!moderation?.is_banned) {
    return false;
  }

  if (moderation.is_permanent_ban) {
    return true;
  }

  if (moderation.ban_expires_at === null) {
    return true;
  }

  const expiresAt = new Date(
    moderation.ban_expires_at,
  ).getTime();

  return !Number.isFinite(expiresAt) || expiresAt > now;
}

/**
 * Mirrors public.is_user_muted().
 *
 * A null mute expiration means an indefinite mute.
 */
function isEffectiveMute(
  moderation: UserMuteModerationState | null,
  now = Date.now(),
): boolean {
  if (!moderation?.is_muted) {
    return false;
  }

  if (moderation.mute_expires_at === null) {
    return true;
  }

  const expiresAt = new Date(
    moderation.mute_expires_at,
  ).getTime();

  return !Number.isFinite(expiresAt) || expiresAt > now;
}

function getEffectiveBanSnapshot(
  moderation: UserBanModerationState | null,
  now = Date.now(),
): EffectiveBanSnapshot {
  const isBanned = isEffectiveBan(moderation, now);

  if (!isBanned || !moderation) {
    return {
      isBanned: false,
      isPermanentBan: false,
      banExpiresAt: null,
    };
  }

  return {
    isBanned: true,
    isPermanentBan: moderation.is_permanent_ban,
    banExpiresAt: moderation.ban_expires_at,
  };
}

function sameEffectiveBanSnapshot(
  left: EffectiveBanSnapshot,
  right: EffectiveBanSnapshot,
): boolean {
  return (
    left.isBanned === right.isBanned &&
    left.isPermanentBan === right.isPermanentBan &&
    left.banExpiresAt === right.banExpiresAt
  );
}

function getAuthBanDuration(
  moderation: UserBanModerationState | null,
  now = Date.now(),
): string | "none" {
  if (!isEffectiveBan(moderation, now)) {
    return "none";
  }

  if (
    moderation?.is_permanent_ban ||
    moderation?.ban_expires_at === null
  ) {
    return permanentAuthBanDuration;
  }

  if (!moderation?.ban_expires_at) {
    return "none";
  }

  const expiration = new Date(
    moderation.ban_expires_at,
  ).getTime();

  if (!Number.isFinite(expiration)) {
    // Fail closed: do not lift an active restriction because
    // its expiration timestamp could not be interpreted.
    return permanentAuthBanDuration;
  }

  const remainingSeconds = Math.ceil(
    (expiration - now) / 1000,
  );

  if (remainingSeconds <= 0) {
    return "none";
  }

  return `${remainingSeconds}s`;
}

/**
 * Retrieves and validates the authoritative database ban state.
 */
async function getUserBanModerationState(
  adminClient: SupabaseClient,
  userId: string,
): Promise<UserBanModerationState | null> {
  const { data, error } = await adminClient
    .from("user_moderation")
    .select(
      "is_banned, is_permanent_ban, ban_expires_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return null;
  }

  if (
    typeof data.is_banned !== "boolean" ||
    typeof data.is_permanent_ban !== "boolean" ||
    !isNullableDatabaseString(data.ban_expires_at)
  ) {
    throw new Error(
      "User moderation returned an invalid ban state.",
    );
  }

  return {
    is_banned: data.is_banned,
    is_permanent_ban: data.is_permanent_ban,
    ban_expires_at: data.ban_expires_at,
  };
}

function throwAdminRpcError(error: {
  code?: string;
  message?: string;
}): never {
  const message =
    error.message || "The administrative operation failed.";

  if (error.code === "P0002") {
    throw new AdminNotFoundError(message);
  }

  if (error.code === "42501") {
    throw new AdminForbiddenError(message);
  }

  if (
    error.code === "22023" ||
    error.code === "P0001"
  ) {
    throw new AdminInputError(message);
  }

  throw new Error(message);
}

// -----------------------------------------------------------------------------
// Admin dashboard summary
// -----------------------------------------------------------------------------

export async function getAdminSummary(
  client: SupabaseClient,
  reportClient: SupabaseClient,
): Promise<AdminSummary> {
  const [
    userRolesResult,
    routesResult,
    communityPostsResult,
    reportsCountResult,
  ] = await Promise.all([
    client
      .from("user_roles")
      .select("user_id")
      .eq("role", "registered_user"),

    client
      .from("routes")
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false),

    client
      .from("community_posts")
      .select("id", { count: "exact", head: true }),

    reportClient
      .from("community_reports")
      .select("id", { count: "exact", head: true }),
  ]);

  if (userRolesResult.error) throw userRolesResult.error;
  if (routesResult.error) throw routesResult.error;

  if (communityPostsResult.error) {
    throw communityPostsResult.error;
  }

  if (
    !Array.isArray(userRolesResult.data) ||
    routesResult.count === null ||
    communityPostsResult.count === null
  ) {
    throw new Error(
      "Admin summary returned incomplete database results.",
    );
  }

  const registeredUserIds = new Set<string>();

  for (const row of userRolesResult.data) {
    if (
      typeof row.user_id !== "string" ||
      !row.user_id
    ) {
      throw new Error(
        "Admin summary returned an invalid user-role record.",
      );
    }

    registeredUserIds.add(row.user_id);
  }

  // Report metrics remain auxiliary and independent from audit activity.
  let reports: number | null = null;

  if (reportsCountResult.error) {
    console.warn(
      "[admin] Report totals are unavailable:",
      reportsCountResult.error.message,
    );
  } else if (reportsCountResult.count !== null) {
    reports = reportsCountResult.count;
  }

  // Dashboard Recent Activity comes exclusively from admin audit logs.
  let recentActivity: AdminRecentActivityItem[] | null = null;

  try {
    recentActivity = await getRecentAdminAuditLogsWithClient(
      client,
      recentActivityLimit,
    );
  } catch (error) {
    console.warn(
      "[admin] Recent audit activity is unavailable:",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    registeredUsers: registeredUserIds.size,
    routes: routesResult.count,
    communityPosts: communityPostsResult.count,
    reports,
    recentActivity,
  };
}

// -----------------------------------------------------------------------------
// Route management
// -----------------------------------------------------------------------------

export async function getAdminRoutes(
  client: SupabaseClient,
): Promise<AdminRouteRecord[]> {
  const { data, error } = await client
    .from("routes")
    .select(
      `
      id,
      name,
      transport_type_id,
      is_active,
      is_approved,
      is_banned,
      is_deleted,
      moderation_status,
      moderation_note,
      transport_types ( name, color ),
      transport_variants ( id, code, name, fare_model ),
      route_stops (
        id,
        route_id,
        stop_order,
        terminal_id,
        stop_id,
        terminals ( id, name, latitude, longitude, is_approved, moderation_status ),
        stops ( id, name, description, stop_type, latitude, longitude, is_approved, moderation_status )
      )
    `,
    )
    .order("name", { ascending: true })
    .order("stop_order", {
      ascending: true,
      referencedTable: "route_stops",
    });

  if (error) throw error;

  if (!Array.isArray(data)) {
    throw new Error(
      "Admin route query returned incomplete database results.",
    );
  }

  return (data as AdminRouteRecord[]).map((route) => {
    if (!Array.isArray(route.route_stops)) {
      throw new Error(
        "Admin route query returned invalid stop data.",
      );
    }

    return {
      ...route,
      route_stops: [...route.route_stops].sort(
        (left, right) =>
          left.stop_order - right.stop_order,
      ),
    };
  });
}

/**
 * Retrieves pending route-change proposals and their complete
 * proposed sequences.
 *
 * This query uses the authenticated reviewer client.
 * RLS grants reviewers access to all proposal records.
 *
 * Proposal-associated pending locations are also collected
 * so they can be excluded from independent stop/terminal
 * moderation results.
 */
async function getPendingRouteChangeProposals(
  client: SupabaseClient,
): Promise<AdminRouteChangeProposalRecord[]> {
  const { data, error } = await client
    .from("route_change_proposals")
    .select(
      `
      id,
      route_id,
      contributor_id,
      contributor_display_name,
      proposal_type,
      proposed_name,
      base_route_snapshot,
      status,
      moderation_note,
      moderated_by,
      moderator_display_name,
      moderated_at,
      applied_at,
      created_at,
      updated_at,
      route_change_proposal_points (
        proposal_id,
        stop_order,
        terminal_id,
        stop_id,
        is_new_point,
        terminals (
          id,
          name,
          latitude,
          longitude,
          transport_type_id,
          is_active,
          is_approved,
          is_banned,
          is_deleted,
          moderation_status,
          moderation_note,
          transport_types ( name, color )
        ),
        stops (
          id,
          name,
          description,
          stop_type,
          latitude,
          longitude,
          transport_type_id,
          is_active,
          is_approved,
          is_banned,
          is_deleted,
          moderation_status,
          moderation_note,
          transport_types ( name, color )
        )
      )
    `,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;

  if (!Array.isArray(data)) {
    throw new Error(
      "Route-change proposal query returned incomplete results.",
    );
  }

  const proposals =
    data as unknown as AdminRouteChangeProposalRecord[];

  return proposals.map((proposal) => {
    if (
      !Number.isSafeInteger(proposal.id) ||
      !Number.isSafeInteger(proposal.route_id) ||
      typeof proposal.contributor_display_name !== "string" ||
      ![
        "insert_point",
        "extend_route",
      ].includes(proposal.proposal_type) ||
      proposal.status !== "pending" ||
      !isPlainRecord(proposal.base_route_snapshot) ||
      !Array.isArray(proposal.route_change_proposal_points)
    ) {
      throw new Error(
        "Route-change proposal query returned an invalid proposal.",
      );
    }

    const points = proposal.route_change_proposal_points;

    for (const point of points) {
      if (
        point.proposal_id !== proposal.id ||
        !Number.isSafeInteger(point.stop_order) ||
        point.stop_order < 1 ||
        typeof point.is_new_point !== "boolean" ||
        (
          (point.terminal_id !== null) ===
          (point.stop_id !== null)
        )
      ) {
        throw new Error(
          "Route-change proposal query returned an invalid proposed location.",
        );
      }
    }

    return {
      ...proposal,
      route_change_proposal_points: [...points].sort(
        (left, right) =>
          left.stop_order - right.stop_order,
      ),
    };
  });
}

/**
 * Retrieves the complete Route Management data set.
 *
 * Existing routes, standalone points, and transport types
 * remain available to the existing administrator interface.
 *
 * Pending locations that belong to pending route-change
 * proposals are excluded from standalone stop/terminal lists.
 *
 * Their moderation must happen through the parent proposal.
 */
export async function getAdminRouteManagementData(
  client: SupabaseClient,
): Promise<AdminRouteManagementData> {
  const [
    routes,
    stopsResult,
    terminalsResult,
    typesResult,
    routeChangeProposals,
  ] = await Promise.all([
    getAdminRoutes(client),

    client
      .from("stops")
      .select(
        "id, name, description, stop_type, latitude, longitude, transport_type_id, is_active, is_approved, is_banned, is_deleted, moderation_status, moderation_note, transport_types(name, color)",
      )
      .order("name", { ascending: true }),

    client
      .from("terminals")
      .select(
        "id, name, latitude, longitude, transport_type_id, is_active, is_approved, is_banned, is_deleted, moderation_status, moderation_note, transport_types(name, color)",
      )
      .order("name", { ascending: true }),

    client
      .from("transport_types")
      .select("id, name, color")
      .order("name", { ascending: true }),

    getPendingRouteChangeProposals(client),
  ]);

  if (stopsResult.error) throw stopsResult.error;
  if (terminalsResult.error) throw terminalsResult.error;
  if (typesResult.error) throw typesResult.error;

  if (
    !Array.isArray(stopsResult.data) ||
    !Array.isArray(terminalsResult.data) ||
    !Array.isArray(typesResult.data)
  ) {
    throw new Error(
      "Route Management returned incomplete database results.",
    );
  }

  // ----------------------------------------------------------
  // Collect proposal-owned pending location IDs.
  // ----------------------------------------------------------

  const proposalOwnedStopIds = new Set<number>();
  const proposalOwnedTerminalIds = new Set<number>();

  for (const proposal of routeChangeProposals) {
    for (
      const point of proposal.route_change_proposal_points
    ) {
      if (!point.is_new_point) {
        continue;
      }

      if (point.stop_id !== null) {
        proposalOwnedStopIds.add(point.stop_id);
      }

      if (point.terminal_id !== null) {
        proposalOwnedTerminalIds.add(point.terminal_id);
      }
    }
  }

  // ----------------------------------------------------------
  // Exclude proposal-owned pending stops from standalone
  // moderation records.
  //
  // Approved and rejected records are not affected.
  // ----------------------------------------------------------

  const standaloneStops =
    (stopsResult.data as AdminTransitPointRecord[]).filter(
      (stop) => {
        return !(
          stop.moderation_status === "pending" &&
          proposalOwnedStopIds.has(stop.id)
        );
      },
    );

  // ----------------------------------------------------------
  // Exclude proposal-owned pending terminals from standalone
  // moderation records.
  // ----------------------------------------------------------

  const standaloneTerminals =
    (terminalsResult.data as AdminTransitPointRecord[]).filter(
      (terminal) => {
        return !(
          terminal.moderation_status === "pending" &&
          proposalOwnedTerminalIds.has(terminal.id)
        );
      },
    );

  return {
    routes,

    stops: standaloneStops,

    terminals: standaloneTerminals,

    transportTypes:
      typesResult.data as AdminTransportTypeRecord[],

    routeChangeProposals,
  };
}

// -----------------------------------------------------------------------------
// User Management
// -----------------------------------------------------------------------------

/**
 * Supported page sizes are intentionally limited.
 * The SQL RPC independently validates these values.
 */
const allowedAdminUserPageSizes = [10, 25, 50, 100] as const;

const defaultAdminUserPageSize = 25;

/**
 * Validates the JSON representation returned by the pagination RPC.
 */
function isAdminUserPageRecord(
  value: unknown,
): value is Record<string, unknown> {
  return isPlainRecord(value);
}

/**
 * Builds the existing public profile-photo URL.
 *
 * Uploaded profile photos take priority over Google metadata.
 *
 * Existing Storage convention:
 * Bucket: profile-photos
 * Path:   {userId}/profile
 *
 * No upload, bucket, or storage-path changes are performed here.
 */
function getAdminProfilePhotoUrl(
  client: SupabaseClient,
  userId: string,
  profilePhotoPath: string | null,
  userMetadata: Record<string, unknown>,
): string | null {
  if (profilePhotoPath !== null) {
    const expectedPath = `${userId}/profile`;

    if (profilePhotoPath !== expectedPath) {
      throw new Error(
        "Admin user query returned an invalid profile-photo path.",
      );
    }

    const { data } = client.storage
      .from(profilePhotoBucket)
      .getPublicUrl(profilePhotoPath);

    if (
      typeof data.publicUrl === "string" &&
      data.publicUrl.startsWith("https://")
    ) {
      return data.publicUrl;
    }
  }

  // Fall back to the existing Google metadata resolver.
  return getGoogleProfilePhotoUrl(userMetadata);
}

/**
 * Validates and normalizes one account returned by the
 * administrative pagination RPC.
 *
 * Internal metadata and Storage paths are not exposed
 * in the final AdminUserRecord.
 */
function parseAdminUserPageRecord(
  client: SupabaseClient,
  value: unknown,
): AdminUserRecord {
  if (!isAdminUserPageRecord(value)) {
    throw new Error(
      "Admin user query returned an invalid account record.",
    );
  }

  const id = value.id;
  const displayName = value.displayName;
  const email = value.email;
  const searchUsername = value.searchUsername;
  const createdAt = value.createdAt;
  const role = value.role;
  const isDeleted = value.isDeleted;

  const isBanned = value.isBanned;
  const isMuted = value.isMuted;
  const isPermanentBan = value.isPermanentBan;

  const banExpiresAt = value.banExpiresAt;
  const muteExpiresAt = value.muteExpiresAt;

  const banReason = value.banReason;
  const muteReason = value.muteReason;

  const authBanSynced = value.authBanSynced;

  const profilePhotoPath = value.profilePhotoPath;
  const userMetadata = value.userMetadata;

  if (
    typeof id !== "string" ||
    !id ||
    !isNullableDatabaseString(displayName) ||
    !isNullableDatabaseString(email) ||
    !isNullableDatabaseString(searchUsername) ||
    typeof createdAt !== "string" ||
    !isValidDateString(createdAt) ||
    (
      role !== "registered_user" &&
      role !== "admin"
    ) ||
    typeof isDeleted !== "boolean" ||
    typeof isBanned !== "boolean" ||
    typeof isMuted !== "boolean" ||
    typeof isPermanentBan !== "boolean" ||
    !isNullableDatabaseString(banExpiresAt) ||
    !isNullableDatabaseString(muteExpiresAt) ||
    !isNullableDatabaseString(banReason) ||
    !isNullableDatabaseString(muteReason) ||
    typeof authBanSynced !== "boolean" ||
    !isNullableDatabaseString(profilePhotoPath) ||
    !isPlainRecord(userMetadata)
  ) {
    throw new Error(
      "Admin user query returned an invalid account record.",
    );
  }

  const normalizedDisplayName =
    displayName?.trim() || "Unnamed user";

  const profilePhotoUrl = getAdminProfilePhotoUrl(
    client,
    id,
    profilePhotoPath,
    userMetadata,
  );

  return {
    id,

    displayName: normalizedDisplayName,
    email,

    // Search-only value. The frontend must never display it.
    searchUsername,

    createdAt,

    role,
    isDeleted,

    profilePhotoUrl,

    isBanned,
    isMuted,

    isPermanentBan:
      isBanned && isPermanentBan,

    banExpiresAt,
    muteExpiresAt,

    banReason,
    muteReason,

    authBanSynced,
  };
}

/**
 * Retrieves one server-side paginated User Management page.
 *
 * This replaces the previous implementation that loaded
 * every user role, every Auth account, and all profiles.
 *
 * The database function:
 *
 * - Verifies the requesting administrator.
 * - Searches display name, email, and username internally.
 * - Applies the selected effective-status filter.
 * - Calculates the total matching account count.
 * - Retrieves only the requested page.
 * - Returns uploaded profile-photo paths and Google metadata.
 * - Calculates effective database mute and ban states.
 *
 * The Express backend uses its privileged Supabase client
 * when invoking this function.
 *
 * Uploaded photos use the existing:
 *
 * profile-photos/{userId}/profile
 *
 * path.
 */
export async function getAdminUsersPage(
  client: SupabaseClient,
  adminUserId: string,
  options: AdminUsersPageRequest = {},
): Promise<AdminUsersPage> {
  // ----------------------------------------------------------
  // Validate administrator identity
  // ----------------------------------------------------------

  if (
    typeof adminUserId !== "string" ||
    !adminUserId.trim()
  ) {
    throw new AdminInputError(
      "An administrator ID is required.",
    );
  }

  // ----------------------------------------------------------
  // Normalize and validate pagination
  // ----------------------------------------------------------

  const page = options.page ?? 1;

  const pageSize =
    options.pageSize ?? defaultAdminUserPageSize;

  if (
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    throw new AdminInputError(
      "Page must be a positive integer.",
    );
  }

  if (
    !allowedAdminUserPageSizes.includes(
      pageSize as (typeof allowedAdminUserPageSizes)[number],
    )
  ) {
    throw new AdminInputError(
      "Page size must be 10, 25, 50, or 100.",
    );
  }

  // ----------------------------------------------------------
  // Normalize and validate search
  // ----------------------------------------------------------

  const search =
    typeof options.search === "string"
      ? options.search.trim()
      : "";

  if (search.length > 100) {
    throw new AdminInputError(
      "Search text cannot exceed 100 characters.",
    );
  }

  // ----------------------------------------------------------
  // Validate status filter
  // ----------------------------------------------------------

  const status: AdminUserManagementStatus =
    options.status ?? "all";

  const allowedStatuses: AdminUserManagementStatus[] = [
    "all",
    "active",
    "muted",
    "banned",
    "deleted",
  ];

  if (!allowedStatuses.includes(status)) {
    throw new AdminInputError(
      "Invalid user status filter.",
    );
  }

  // ----------------------------------------------------------
  // Execute the database pagination RPC
  // ----------------------------------------------------------

  const { data, error } = await client.rpc(
    "admin_get_user_management_page_v1",
    {
      p_admin_user_id: adminUserId,
      p_page: page,
      p_page_size: pageSize,
      p_search: search,
      p_status: status,
    },
  );

  if (error) {
    throwAdminRpcError(error);
  }

  // ----------------------------------------------------------
  // Validate the RPC response
  // ----------------------------------------------------------

  if (!isPlainRecord(data)) {
    throw new Error(
      "Admin user pagination returned an invalid response.",
    );
  }

  const totalCount = data.totalCount;
  const returnedPage = data.page;
  const returnedPageSize = data.pageSize;
  const totalPages = data.totalPages;
  const rawUsers = data.users;

  if (
    typeof totalCount !== "number" ||
    !Number.isSafeInteger(totalCount) ||
    totalCount < 0 ||
    typeof returnedPage !== "number" ||
    !Number.isSafeInteger(returnedPage) ||
    returnedPage < 1 ||
    returnedPageSize !== pageSize ||
    typeof totalPages !== "number" ||
    !Number.isSafeInteger(totalPages) ||
    totalPages < 0 ||
    !Array.isArray(rawUsers)
  ) {
    throw new Error(
      "Admin user pagination returned incomplete data.",
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
        ? returnedPage !== 1
        : returnedPage > totalPages
    ) ||
    rawUsers.length > pageSize
  ) {
    throw new Error(
      "Admin user pagination returned inconsistent page information.",
    );
  }

  // ----------------------------------------------------------
  // Parse and resolve only the requested page's photo URLs.
  // ----------------------------------------------------------

  const users = rawUsers.map((row) =>
    parseAdminUserPageRecord(client, row),
  );

  // ----------------------------------------------------------
  // Return the normalized page.
  // ----------------------------------------------------------

  return {
    users,
    totalCount,
    page: returnedPage,
    pageSize,
    totalPages,
  };
}

export async function updateAdminUserRole(
  client: SupabaseClient,
  adminUserId: string,
  userId: string,
  role: AdminUserRole,
): Promise<void> {
  const { error } = await client.rpc(
    "admin_set_user_role",
    {
      p_admin_user_id: adminUserId,
      p_target_user_id: userId,
      p_new_role: role,
    },
  );

  if (error) {
    throwAdminRpcError(error);
  }
}

/**
 * Synchronizes Supabase Auth's ban with the authoritative
 * public.user_moderation record.
 *
 * It never accepts a desired ban state from the caller.
 * The desired state is always read from the database.
 *
 * The function rechecks the database after each Auth update.
 * If the ban changed while the Auth request was in flight,
 * another pass reconciles the latest database state.
 */
export async function syncAdminUserAuthBan(
  adminClient: SupabaseClient,
  userId: string,
): Promise<void> {
  for (
    let attempt = 1;
    attempt <= authBanSyncMaxAttempts;
    attempt += 1
  ) {
    const moderationBefore =
      await getUserBanModerationState(
        adminClient,
        userId,
      );

    const updateStartedAt = Date.now();

    const banDuration = getAuthBanDuration(
      moderationBefore,
      updateStartedAt,
    );

    const { error: authError } =
      await adminClient.auth.admin.updateUserById(
        userId,
        {
          ban_duration: banDuration,
        },
      );

    if (authError) {
      console.error(
        "[admin] Supabase Auth ban synchronization failed:",
        authError.message,
      );

      throw new AdminAuthSyncError(
        "The database restriction state is saved, but Supabase Auth sign-in access could not be synchronized.",
      );
    }

    const moderationAfter =
      await getUserBanModerationState(
        adminClient,
        userId,
      );

    const verificationTime = Date.now();

    const beforeSnapshot = getEffectiveBanSnapshot(
      moderationBefore,
      verificationTime,
    );

    const afterSnapshot = getEffectiveBanSnapshot(
      moderationAfter,
      verificationTime,
    );

    const databaseStateChanged =
      !sameEffectiveBanSnapshot(
        beforeSnapshot,
        afterSnapshot,
      );

    // If the ban expired while the Auth request was in flight,
    // do not leave behind a short-lived Auth ban. Run another
    // pass so the current database state produces "none".
    const banExpiredDuringSynchronization =
      !afterSnapshot.isBanned &&
      banDuration !== "none";

    if (
      !databaseStateChanged &&
      !banExpiredDuringSynchronization
    ) {
      return;
    }
  }

  throw new AdminAuthSyncError(
    "The account's database ban changed repeatedly during synchronization. The database state remains authoritative; retry Auth synchronization.",
  );
}

/**
 * Applies or removes a user restriction using the verified RPC.
 *
 * The database RPC performs the restriction update and audit
 * insertion atomically.
 *
 * Only ban-related actions synchronize Supabase Auth.
 * Mute/unmute never changes sign-in access.
 */
export async function applyAdminUserRestriction(
  adminClient: SupabaseClient,
  adminUserId: string,
  userId: string,
  action: AdminUserRestrictionAction,
  durationSeconds: number | null,
  reason: string | null,
): Promise<AdminUserRestrictionResult> {
  const { data, error } = await adminClient.rpc(
    "admin_set_user_restriction",
    {
      p_admin_user_id: adminUserId,
      p_target_user_id: userId,
      p_action: action,
      p_duration_seconds: durationSeconds,
      p_reason: reason,
    },
  );

  if (error) {
    throwAdminRpcError(error);
  }

  if (!isPlainRecord(data)) {
    throw new Error(
      "The moderation RPC returned an invalid result.",
    );
  }

  if (
    data.userId !== userId ||
    data.action !== action ||
    typeof data.isBanned !== "boolean" ||
    typeof data.isMuted !== "boolean" ||
    typeof data.isPermanentBan !== "boolean" ||
    typeof data.isEffectivelyBanned !== "boolean" ||
    typeof data.isEffectivelyMuted !== "boolean" ||
    !isNullableDatabaseString(data.banExpiresAt) ||
    !isNullableDatabaseString(data.muteExpiresAt)
  ) {
    throw new Error(
      "The moderation RPC returned an invalid result.",
    );
  }

  // A successful RPC has already committed the moderation record
  // and its audit log. Auth synchronization happens afterward.
  //
  // If synchronization fails, report partial success rather than
  // incorrectly suggesting that the database update rolled back.
  if (
    action === "ban_temporary" ||
    action === "ban_permanent" ||
    action === "unban"
  ) {
    try {
      await syncAdminUserAuthBan(
        adminClient,
        userId,
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Unknown Auth synchronization failure.";

      console.error(
        "[admin] Restriction was committed, but Auth synchronization failed:",
        error,
      );

      throw new AdminAuthSyncError(
        `The database restriction was saved successfully, but Supabase Auth synchronization failed. ${detail}`,
      );
    }
  }

  return {
    userId,
    action,
    isBanned: data.isBanned,
    isMuted: data.isMuted,
    isPermanentBan: data.isPermanentBan,
    banExpiresAt: data.banExpiresAt,
    muteExpiresAt: data.muteExpiresAt,
    isEffectivelyBanned: data.isEffectivelyBanned,
    isEffectivelyMuted: data.isEffectivelyMuted,
  };
}

/**
 * Retrieves the moderation history for a particular account.
 *
 * The database RPCs already write moderation audit events
 * transactionally. This function reads those existing entries;
 * it does not create additional audit records.
 */
export async function getAdminUserModerationHistory(
  client: SupabaseClient,
  userId: string,
): Promise<AdminUserModerationHistoryItem[]> {
  const moderationActionKeys = [
    "user_muted",
    "user_unmuted",
    "user_temporarily_banned",
    "user_permanently_banned",
    "user_unbanned",

    // Retain compatibility with older Auth-only ban audit entries.
    "user_banned",
  ];

  const { data, error } = await client
    .from("admin_audit_logs")
    .select(
      [
        "id",
        "action_key",
        "action_title",
        "description",
        "admin_display_name",
        "occurred_at",
        "metadata",
      ].join(", "),
    )
    .eq("target_type", "user")
    .eq("target_id", userId)
    .in("action_key", moderationActionKeys)
    .order("occurred_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  if (!Array.isArray(data)) {
    throw new Error(
      "Moderation history returned incomplete data.",
    );
  }

  return data.map((row) => {
    if (
      typeof row.id !== "string" ||
      typeof row.action_key !== "string" ||
      typeof row.action_title !== "string" ||
      typeof row.occurred_at !== "string" ||
      !isNullableDatabaseString(row.description) ||
      !isNullableDatabaseString(row.admin_display_name)
    ) {
      throw new Error(
        "Moderation history returned an invalid record.",
      );
    }

    const metadata = isPlainRecord(row.metadata)
      ? row.metadata
      : {};

    return {
      id: row.id,
      actionKey: row.action_key,
      title: row.action_title,
      description: row.description ?? "",
      adminDisplayName:
        row.admin_display_name?.trim() ||
        "Administrator",
      occurredAt: row.occurred_at,
      metadata,
    };
  });
}

// -----------------------------------------------------------------------------
// Community reports
// -----------------------------------------------------------------------------

export async function getAdminReports(
  client: SupabaseClient,
): Promise<AdminReportRecord[]> {
  const { data, error } = await client
    .from("community_reports")
    .select(
      "id, target_type, post_id, comment_id, reported_user_id, reported_user_name, reported_content, reporter_id, reason, status, description, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  if (!Array.isArray(data)) {
    throw new Error(
      "Admin reports returned an invalid database result.",
    );
  }

  return data.map((row) => {
    const type =
      row.target_type === "post"
        ? "Post"
        : row.target_type === "comment"
          ? "Comment"
          : row.target_type === "user"
            ? "User"
            : null;

    const id = Number(row.id);

    if (
      !type ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      typeof row.reporter_id !== "string" ||
      typeof row.reported_user_name !== "string" ||
      typeof row.reported_content !== "string" ||
      typeof row.reason !== "string" ||
      (
        row.status !== "Pending" &&
        row.status !== "Reviewed" &&
        row.status !== "Dismissed"
      ) ||
      typeof row.created_at !== "string" ||
      (
        row.post_id !== null &&
        typeof row.post_id !== "string"
      ) ||
      (
        row.comment_id !== null &&
        typeof row.comment_id !== "string"
      ) ||
      (
        row.reported_user_id !== null &&
        typeof row.reported_user_id !== "string"
      ) ||
      (
        row.description !== null &&
        typeof row.description !== "string"
      )
    ) {
      throw new Error(
        "Admin reports returned an invalid record.",
      );
    }

    return {
      id,
      type,
      targetType: row.target_type,
      postId: row.post_id,
      commentId: row.comment_id,
      reportedUserId: row.reported_user_id,
      reason: row.reason,
      reportedContent: row.reported_content,
      reporter: row.reporter_id,
      reportedUser: row.reported_user_name,
      date: new Date(row.created_at).toLocaleDateString(
        "en-US",
        {
          month: "short",
          day: "numeric",
          year: "numeric",
        },
      ),
      status: row.status,
      description: row.description ?? "",
    };
  });
}

export async function updateAdminReportStatus(
  client: SupabaseClient,
  id: number,
  status: "Pending" | "Reviewed" | "Dismissed",
): Promise<void> {
  const { data: report, error } = await client
    .from("community_reports")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (!report) {
    throw new AdminNotFoundError(
      "Community report not found.",
    );
  }
}

// -----------------------------------------------------------------------------
// Community post management
// -----------------------------------------------------------------------------

export async function setCommunityPostVisibility(
  client: SupabaseClient,
  postId: string,
  isHidden: boolean,
): Promise<void> {
  const { data: post, error: updateError } = await client
    .from("community_posts")
    .update({ is_hidden: isHidden })
    .eq("id", postId)
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;

  if (!post) {
    throw new AdminNotFoundError(
      "Community post not found.",
    );
  }
}

export async function getAdminCommunityPosts(
  client: SupabaseClient,
) {
  const { data: posts, error: postsError } = await client
    .from("community_posts")
    .select(
      "id, author_id, author_display_name, title, content, start_name, start_latitude, start_longitude, destination_name, destination_latitude, destination_longitude, transport_type_id, photo_paths, is_hidden, created_at, transport_types(name), community_post_comments(count)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (postsError) throw postsError;

  const rows = posts ?? [];

  if (!rows.length) {
    return [];
  }

  const postIds = rows.map((post) => post.id);

  const { data: votes, error: votesError } = await client
    .from("community_post_votes")
    .select("post_id, vote_type")
    .in("post_id", postIds);

  if (votesError) throw votesError;

  const totals = new Map<
    string,
    {
      upvotes: number;
      downvotes: number;
    }
  >();

  for (const postId of postIds) {
    totals.set(postId, {
      upvotes: 0,
      downvotes: 0,
    });
  }

  for (const vote of votes ?? []) {
    const total = totals.get(vote.post_id);

    if (!total) continue;

    if (vote.vote_type === "upvote") {
      total.upvotes += 1;
    }

    if (vote.vote_type === "downvote") {
      total.downvotes += 1;
    }
  }

  return rows.map((post) => ({
    ...post,
    transport_type: post.transport_types?.name ?? null,
    comment_count:
      post.community_post_comments?.[0]?.count ?? 0,
    upvotes: totals.get(post.id)?.upvotes ?? 0,
    downvotes: totals.get(post.id)?.downvotes ?? 0,
    transport_types: undefined,
    community_post_comments: undefined,
  }));
}

export async function deleteAdminPost(
  client: SupabaseClient,
  postId: string,
): Promise<void> {
  const { data: post, error: fetchError } = await client
    .from("community_posts")
    .select("photo_paths")
    .eq("id", postId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!post) {
    throw new AdminNotFoundError(
      "Community post not found.",
    );
  }

  const { error: deleteError } = await client
    .from("community_posts")
    .delete()
    .eq("id", postId);

  if (deleteError) throw deleteError;

  const photoPaths = Array.isArray(post.photo_paths)
    ? post.photo_paths.filter(
        (path): path is string =>
          typeof path === "string" && path.length > 0,
      )
    : [];

  if (photoPaths.length === 0) {
    return;
  }

  const { error: storageError } = await client.storage
    .from(communityPhotoBucket)
    .remove(photoPaths);

  if (storageError) {
    console.error(
      "[admin] Post photos could not be removed from storage:",
      storageError.message,
    );
  }
}

// -----------------------------------------------------------------------------
// Route-stop utilities
// -----------------------------------------------------------------------------

interface RouteStopRow {
  route_id: number;
  stop_order: number;
  terminal_id: number | null;
  stop_id: number | null;
}

function toRouteStopRows(
  routeId: number,
  stops: AdminRouteStopInput[],
): RouteStopRow[] {
  return stops.map((stop, index) => ({
    route_id: routeId,
    stop_order: index + 1,
    terminal_id:
      stop.kind === "terminal" ? stop.id : null,
    stop_id:
      stop.kind === "stop" ? stop.id : null,
  }));
}

/**
 * Preserved existing helper for route-stop replacement.
 * It retains the original restoration behavior if insertion fails.
 */
async function replaceRouteStops(
  client: SupabaseClient,
  routeId: number,
  stops: AdminRouteStopInput[],
): Promise<void> {
  const {
    data: previousStops,
    error: captureError,
  } = await client
    .from("route_stops")
    .select("route_id, stop_order, terminal_id, stop_id")
    .eq("route_id", routeId);

  if (captureError) throw captureError;

  const previousRows: RouteStopRow[] =
    Array.isArray(previousStops)
      ? previousStops.map((row) => ({
          route_id: row.route_id,
          stop_order: row.stop_order,
          terminal_id: row.terminal_id ?? null,
          stop_id: row.stop_id ?? null,
        }))
      : [];

  const { error: deleteError } = await client
    .from("route_stops")
    .delete()
    .eq("route_id", routeId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await client
    .from("route_stops")
    .insert(toRouteStopRows(routeId, stops));

  if (insertError) {
    if (previousRows.length > 0) {
      const { error: restoreError } = await client
        .from("route_stops")
        .insert(previousRows);

      if (restoreError) {
        console.error(
          "[admin] Route stops could not be restored after a failed update:",
          restoreError.message,
        );
      }
    }

    throw insertError;
  }
}

// -----------------------------------------------------------------------------
// Route updates and archival
// -----------------------------------------------------------------------------

export async function updateAdminRoute(
  client: SupabaseClient,
  routeId: number,
  input: AdminRouteUpdateInput,
): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.transportTypeId !== undefined) {
    updates.transport_type_id = input.transportTypeId;
  }

  if (input.variantId !== undefined) {
    updates.variant_id = input.variantId;
  }

  if (input.isActive !== undefined) {
    updates.is_active = input.isActive;
  }

  if (input.stops !== undefined) {
    updates.stops = input.stops.map(({ kind, id }) => ({
      kind,
      id,
    }));
  }

  if (input.moderationStatus !== undefined) {
    if (input.moderationStatus === "pending") {
      throw new AdminInputError(
        "A moderated route cannot be returned to pending.",
      );
    }

    updates.moderation_status = input.moderationStatus;

    updates.moderation_note =
      input.moderationStatus === "rejected"
        ? input.moderationNote ?? null
        : null;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await client.rpc(
      "manage_transit_record",
      {
        p_entity_type: "route",
        p_action: "update",
        p_entity_id: routeId,
        p_payload: updates,
      },
    );

    if (error?.code === "P0002") {
      throw new AdminNotFoundError("Route not found.");
    }

    if (error) throw error;
  }
}

export async function deleteAdminRoute(
  client: SupabaseClient,
  routeId: number,
): Promise<void> {
  const { error } = await client.rpc(
    "manage_transit_record",
    {
      p_entity_type: "route",
      p_action: "archive",
      p_entity_id: routeId,
      p_payload: {},
    },
  );

  if (error?.code === "P0002") {
    throw new AdminNotFoundError("Route not found.");
  }

  if (error) throw error;
}
