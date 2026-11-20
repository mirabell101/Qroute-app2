import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminRouteStopInput,
  AdminRouteUpdateInput,
} from "./adminValidation.ts";
import { getRecentAdminAuditLogsWithClient } from "./adminAudit.ts";

const authUsersPerPage = 1000;
const profileBatchSize = 200;
const recentActivityLimit = 5;
const communityPhotoBucket = "community-post-photos";

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
  is_approved: boolean;
  moderation_status: "pending" | "approved" | "rejected";
}

interface AdminRouteStop {
  route_id: number;
  stop_order: number;
  terminals: AdminRoutePoint | null;
  stops: (AdminRoutePoint & {
    description: string | null;
    stop_type: "road_stop" | "train_station";
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
  if (communityPostsResult.error) throw communityPostsResult.error;

  if (
    !Array.isArray(userRolesResult.data) ||
    routesResult.count === null ||
    communityPostsResult.count === null
  ) {
    throw new Error("Admin summary returned incomplete database results.");
  }

  const registeredUserIds = new Set<string>();

  for (const row of userRolesResult.data) {
    if (typeof row.user_id !== "string" || !row.user_id) {
      throw new Error("Admin summary returned an invalid user-role record.");
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

  // Dashboard Recent Activity now comes exclusively from admin audit logs.
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
      fare_area_id,
      is_active,
      is_approved,
      is_banned,
      is_deleted,
      moderation_status,
      moderation_note,
      transport_types ( name, color ),
      transport_variants ( id, code, name, fare_model ),
      route_stops (
        route_id,
        stop_order,
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
    throw new Error("Admin route query returned incomplete database results.");
  }

  return (data as AdminRouteRecord[]).map((route) => {
    if (!Array.isArray(route.route_stops)) {
      throw new Error("Admin route query returned invalid stop data.");
    }

    return {
      ...route,
      route_stops: [...route.route_stops].sort(
        (left, right) => left.stop_order - right.stop_order,
      ),
    };
  });
}

export async function getAdminRouteManagementData(
  client: SupabaseClient,
): Promise<AdminRouteManagementData> {
  const [routes, stopsResult, terminalsResult, typesResult] = await Promise.all([
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
  ]);

  if (stopsResult.error) throw stopsResult.error;
  if (terminalsResult.error) throw terminalsResult.error;
  if (typesResult.error) throw typesResult.error;
  if (
    !Array.isArray(stopsResult.data) ||
    !Array.isArray(terminalsResult.data) ||
    !Array.isArray(typesResult.data)
  ) {
    throw new Error("Route Management returned incomplete database results.");
  }

  return {
    routes,
    stops: stopsResult.data as AdminTransitPointRecord[],
    terminals: terminalsResult.data as AdminTransitPointRecord[],
    transportTypes: typesResult.data as AdminTransportTypeRecord[],
  };
}

export async function getAdminUsers(
  client: SupabaseClient,
): Promise<AdminUserRecord[]> {
  const { data: roleRows, error: roleError } = await client
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["registered_user", "moderator"]);

  if (roleError) throw roleError;

  if (!Array.isArray(roleRows)) {
    throw new Error("Admin user query returned incomplete role data.");
  }

  const userRoles = new Map<string, AdminUserRecord["role"]>();

  for (const row of roleRows) {
    if (
      typeof row.user_id !== "string" ||
      !row.user_id ||
      (row.role !== "registered_user" && row.role !== "moderator")
    ) {
      throw new Error("Admin user query returned an invalid user-role record.");
    }

    userRoles.set(row.user_id, row.role);
  }

  if (userRoles.size === 0) return [];

  const authUsers = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: authUsersPerPage,
    });

    if (error) throw error;

    if (!Array.isArray(data.users)) {
      throw new Error("Auth Admin returned incomplete user data.");
    }

    authUsers.push(...data.users);

    if (data.users.length < authUsersPerPage) break;
  }

  const authUsersById = new Map(
    authUsers.map((user) => [user.id, user]),
  );

  const missingUserId = [...userRoles.keys()].find(
    (id) => !authUsersById.has(id),
  );

  if (missingUserId) {
    throw new Error("A registered user account could not be loaded.");
  }

  const profileUsernames = new Map<string, string | null>();
  const ids = [...userRoles.keys()];

  for (let start = 0; start < ids.length; start += profileBatchSize) {
    const batch = ids.slice(start, start + profileBatchSize);

    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id, username")
      .in("id", batch);

    if (profileError) throw profileError;

    if (!Array.isArray(profiles)) {
      throw new Error("Admin user query returned incomplete profile data.");
    }

    for (const profile of profiles) {
      if (
        typeof profile.id !== "string" ||
        !(
          profile.username === null ||
          typeof profile.username === "string"
        )
      ) {
        throw new Error("Admin user query returned an invalid profile record.");
      }

      profileUsernames.set(profile.id, profile.username);
    }
  }

  return [...userRoles]
    .map(([id, role]) => {
      const user = authUsersById.get(id);

      if (!user) {
        throw new Error("A registered user account could not be loaded.");
      }

      const bannedUntil = user.banned_until;

      const isBanned = Boolean(
        bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
      );

      const record: AdminUserRecord = {
        id,
        email: user.email ?? null,
        username: profileUsernames.get(id) ?? null,
        createdAt: user.created_at,
        role,
      };

      if (isBanned) {
        record.banned = true;
      }

      return record;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function updateAdminUserRole(
  client: SupabaseClient,
  userId: string,
  role: AdminUserRecord["role"],
): Promise<void> {
  const { data, error } = await client
    .from("user_roles")
    .update({ role })
    .eq("user_id", userId)
    .in("role", ["registered_user", "moderator"])
    .select("user_id")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new AdminNotFoundError("Registered user was not found.");
  }
}

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
    throw new Error("Admin reports returned an invalid database result.");
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
      (row.status !== "Pending" &&
        row.status !== "Reviewed" &&
        row.status !== "Dismissed") ||
      typeof row.created_at !== "string" ||
      (row.post_id !== null && typeof row.post_id !== "string") ||
      (row.comment_id !== null && typeof row.comment_id !== "string") ||
      (row.reported_user_id !== null &&
        typeof row.reported_user_id !== "string") ||
      (row.description !== null && typeof row.description !== "string")
    ) {
      throw new Error("Admin reports returned an invalid record.");
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
      date: new Date(row.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
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
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (!report) {
    throw new AdminNotFoundError("Community report not found.");
  }
}

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
    throw new AdminNotFoundError("Community post not found.");
  }
}

export async function getAdminCommunityPosts(client: SupabaseClient) {
  const { data: posts, error: postsError } = await client
    .from("community_posts")
    .select(
      "id, author_id, author_display_name, title, content, start_name, start_latitude, start_longitude, destination_name, destination_latitude, destination_longitude, transport_type_id, photo_paths, is_hidden, created_at, transport_types(name), community_post_comments(count)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (postsError) throw postsError;

  const rows = posts ?? [];

  if (!rows.length) return [];

  const postIds = rows.map((post) => post.id);

  const { data: votes, error: votesError } = await client
    .from("community_post_votes")
    .select("post_id, vote_type")
    .in("post_id", postIds);

  if (votesError) throw votesError;

  const totals = new Map<string, { upvotes: number; downvotes: number }>();

  for (const postId of postIds) {
    totals.set(postId, { upvotes: 0, downvotes: 0 });
  }

  for (const vote of votes ?? []) {
    const total = totals.get(vote.post_id);

    if (!total) continue;

    if (vote.vote_type === "upvote") total.upvotes += 1;
    if (vote.vote_type === "downvote") total.downvotes += 1;
  }

  return rows.map((post) => ({
    ...post,
    transport_type: post.transport_types?.name ?? null,
    comment_count: post.community_post_comments?.[0]?.count ?? 0,
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
    throw new AdminNotFoundError("Community post not found.");
  }

  const { error: deleteError } = await client
    .from("community_posts")
    .delete()
    .eq("id", postId);

  if (deleteError) throw deleteError;

  const photoPaths = Array.isArray(post.photo_paths)
    ? post.photo_paths.filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      )
    : [];

  if (photoPaths.length === 0) return;

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
    terminal_id: stop.kind === "terminal" ? stop.id : null,
    stop_id: stop.kind === "stop" ? stop.id : null,
  }));
}

async function replaceRouteStops(
  client: SupabaseClient,
  routeId: number,
  stops: AdminRouteStopInput[],
): Promise<void> {
  const { data: previousStops, error: captureError } = await client
    .from("route_stops")
    .select("route_id, stop_order, terminal_id, stop_id")
    .eq("route_id", routeId);

  if (captureError) throw captureError;

  const previousRows: RouteStopRow[] = Array.isArray(previousStops)
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

export async function updateAdminRoute(
  client: SupabaseClient,
  routeId: number,
  input: AdminRouteUpdateInput,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.transportTypeId !== undefined) {
    updates.transport_type_id = input.transportTypeId;
  }
  if (input.variantId !== undefined) updates.variant_id = input.variantId;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  if (input.stops !== undefined) {
    updates.stops = input.stops.map(({ kind, id }) => ({ kind, id }));
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
    const { error } = await client.rpc("manage_transit_record", {
      p_entity_type: "route",
      p_action: "update",
      p_entity_id: routeId,
      p_payload: updates,
    });

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
  const { error } = await client.rpc("manage_transit_record", {
    p_entity_type: "route",
    p_action: "archive",
    p_entity_id: routeId,
    p_payload: {},
  });

  if (error?.code === "P0002") {
    throw new AdminNotFoundError("Route not found.");
  }
  if (error) throw error;
}

export async function toggleAdminUserBan(
  adminClient: SupabaseClient,
  userId: string,
  ban: boolean,
): Promise<void> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: ban ? "876000h" : "none",
  });

  if (error) throw error;
}