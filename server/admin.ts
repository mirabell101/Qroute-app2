import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminRouteCreateInput,
  AdminRouteStopInput,
  AdminRouteUpdateInput,
} from "./adminValidation.ts";

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
  is_approved: boolean;
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

export async function getAdminSummary(
  client: SupabaseClient,
): Promise<AdminSummary> {
  const [
    userRolesResult,
    routesResult,
    communityPostsResult,
    reportsCountResult,
    reportsRecentResult,
    communityPostsRecentResult,
  ] = await Promise.all([
    client
      .from("user_roles")
      .select("user_id")
      .eq("role", "registered_user"),
    client.from("routes").select("id", { count: "exact", head: true }),
    client.from("community_posts").select("id", { count: "exact", head: true }),
    client.from("reports").select("id", { count: "exact", head: true }),
    client
      .from("reports")
      .select("id, type, reason, reported_content, created_at")
      .order("created_at", { ascending: false })
      .limit(recentActivityLimit),
    client
      .from("community_posts")
      .select("id, title, author_display_name, created_at")
      .order("created_at", { ascending: false })
      .limit(recentActivityLimit),
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

  // Report metrics are auxiliary: when the reports table cannot be read
  // (for example, before its migration has been applied), the summary still
  // returns the working core metrics with explicit nulls instead of
  // fabricated zero totals.
  let reports: number | null = null;
  if (reportsCountResult.error) {
    console.warn(
      "[admin] Report totals are unavailable:",
      reportsCountResult.error.message,
    );
  } else if (reportsCountResult.count !== null) {
    reports = reportsCountResult.count;
  }

  let recentActivity: AdminRecentActivityItem[] | null = null;
  if (
    !reportsRecentResult.error &&
    Array.isArray(reportsRecentResult.data) &&
    !communityPostsRecentResult.error &&
    Array.isArray(communityPostsRecentResult.data)
  ) {
    const items: AdminRecentActivityItem[] = [];
    for (const row of reportsRecentResult.data) {
      items.push({
        kind: "report",
        title:
          typeof row.reason === "string" && row.reason
            ? row.reason
            : "Community report",
        detail:
          typeof row.reported_content === "string" ? row.reported_content : "",
        occurredAt: typeof row.created_at === "string" ? row.created_at : "",
      });
    }
    for (const row of communityPostsRecentResult.data) {
      items.push({
        kind: "post",
        title:
          typeof row.title === "string" && row.title
            ? row.title
            : "Community post",
        detail: `Posted by ${
          typeof row.author_display_name === "string"
            ? row.author_display_name
            : "an unknown author"
        }`,
        occurredAt: typeof row.created_at === "string" ? row.created_at : "",
      });
    }
    items.sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    );
    recentActivity = items.slice(0, recentActivityLimit);
  } else {
    if (reportsRecentResult.error) {
      console.warn(
        "[admin] Recent reports are unavailable:",
        reportsRecentResult.error.message,
      );
    }
    if (communityPostsRecentResult.error) {
      console.warn(
        "[admin] Recent community posts are unavailable:",
        communityPostsRecentResult.error.message,
      );
    }
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
      transport_types ( name, color ),
      transport_variants ( id, code, name, fare_model ),
      route_stops (
        route_id,
        stop_order,
        terminals ( id, name, latitude, longitude, is_approved ),
        stops ( id, name, description, stop_type, latitude, longitude, is_approved )
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

export async function getAdminUsers(
  client: SupabaseClient,
): Promise<AdminUserRecord[]> {
  const { data: roleRows, error: roleError } = await client
    .from("user_roles")
    .select("user_id")
    .eq("role", "registered_user");

  if (roleError) throw roleError;
  if (!Array.isArray(roleRows)) {
    throw new Error("Admin user query returned incomplete role data.");
  }

  const registeredUserIds = new Set<string>();
  for (const row of roleRows) {
    if (typeof row.user_id !== "string" || !row.user_id) {
      throw new Error("Admin user query returned an invalid user-role record.");
    }
    registeredUserIds.add(row.user_id);
  }
  if (registeredUserIds.size === 0) return [];

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
  const missingUserId = [...registeredUserIds].find(
    (id) => !authUsersById.has(id),
  );
  if (missingUserId) {
    throw new Error("A registered user account could not be loaded.");
  }

  const profileUsernames = new Map<string, string | null>();
  const ids = [...registeredUserIds];
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

  return [...registeredUserIds]
    .map((id) => {
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
      };
      if (isBanned) {
        record.banned = true;
      }
      return record;
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getAdminReports(
  client: SupabaseClient,
): Promise<AdminReportRecord[]> {
  const { data, error } = await client
    .from("reports")
    .select("id, type, reason, reported_content, reporter, reported_user, status, description, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!Array.isArray(data)) return [];

  return data.map((row) => ({
    id: Number(row.id),
    type: row.type ?? "Post",
    reason: row.reason ?? "",
    reportedContent: row.reported_content ?? "",
    reporter: row.reporter ?? "anonymous",
    reportedUser: row.reported_user ?? "unknown",
    date: new Date(row.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    status: row.status ?? "Pending",
    description: row.description ?? "",
  }));
}

export async function updateAdminReportStatus(
  client: SupabaseClient,
  id: number,
  status: "Pending" | "Reviewed" | "Dismissed",
): Promise<void> {
  const { error } = await client
    .from("reports")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
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

  // The post row is already deleted, so a failed photo cleanup must not
  // report the whole request as failed; it is logged for follow-up instead.
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

async function verifyRouteVariant(
  client: SupabaseClient,
  transportTypeId: number,
  variantId: number,
): Promise<void> {
  const { data, error } = await client
    .from("transport_variants")
    .select("id, transport_type_id")
    .eq("id", variantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new AdminInputError("Choose a valid transport variant.");
  }
  if (data.transport_type_id !== transportTypeId) {
    throw new AdminInputError(
      "The selected variant does not belong to the selected transport type.",
    );
  }
}

async function verifyRoutePoints(
  client: SupabaseClient,
  stops: AdminRouteStopInput[],
): Promise<void> {
  const terminalIds = [
    ...new Set(
      stops
        .filter((stop) => stop.kind === "terminal")
        .map((stop) => stop.id),
    ),
  ];
  const stopIds = [
    ...new Set(
      stops.filter((stop) => stop.kind === "stop").map((stop) => stop.id),
    ),
  ];

  if (terminalIds.length > 0) {
    const { data, error } = await client
      .from("terminals")
      .select("id")
      .in("id", terminalIds);
    if (error) throw error;
    const foundIds = new Set(
      (Array.isArray(data) ? data : []).map((row) => row.id),
    );
    if (foundIds.size !== terminalIds.length) {
      throw new AdminInputError(
        "One or more selected terminals could not be found.",
      );
    }
  }

  if (stopIds.length > 0) {
    const { data, error } = await client
      .from("stops")
      .select("id")
      .in("id", stopIds);
    if (error) throw error;
    const foundIds = new Set(
      (Array.isArray(data) ? data : []).map((row) => row.id),
    );
    if (foundIds.size !== stopIds.length) {
      throw new AdminInputError(
        "One or more selected stops could not be found.",
      );
    }
  }
}

export async function createAdminRoute(
  client: SupabaseClient,
  input: AdminRouteCreateInput,
  adminUserId: string,
): Promise<{ id: number }> {
  // Validate every reference before writing so a bad input can never leave
  // a half-created route behind.
  await verifyRouteVariant(client, input.transportTypeId, input.variantId);
  await verifyRoutePoints(client, input.stops);

  const { data: route, error: routeError } = await client
    .from("routes")
    .insert({
      name: input.name,
      transport_type_id: input.transportTypeId,
      variant_id: input.variantId,
      fare_area_id: null,
      created_by: adminUserId,
      is_active: true,
      is_approved: true,
      moderation_status: "approved",
      moderation_note: null,
      moderated_by: adminUserId,
      moderated_at: new Date().toISOString(),
      is_banned: false,
      is_deleted: false,
    })
    .select("id")
    .single();

  if (routeError) throw routeError;
  if (!route || typeof route.id !== "number") {
    throw new Error("Route creation returned an incomplete result.");
  }

  const { error: stopsError } = await client
    .from("route_stops")
    .insert(toRouteStopRows(route.id, input.stops));

  if (stopsError) {
    // supabase-js cannot run the route and stop inserts in one transaction,
    // so compensate by removing the just-created route row.
    const { error: cleanupError } = await client
      .from("routes")
      .delete()
      .eq("id", route.id);
    if (cleanupError) {
      console.error(
        "[admin] Route creation failed and the created route could not be removed:",
        cleanupError.message,
      );
    }
    throw stopsError;
  }

  return { id: route.id };
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
    // Restore the captured stops so a failed replacement does not leave the
    // route without its stop sequence.
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
  adminUserId: string,
): Promise<void> {
  const { data: route, error: fetchError } = await client
    .from("routes")
    .select("id, transport_type_id, variant_id")
    .eq("id", routeId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!route) {
    throw new AdminNotFoundError("Route not found.");
  }

  const updates: Record<string, unknown> = {};
  const nextTransportTypeId =
    input.transportTypeId ?? route.transport_type_id;
  const nextVariantId = input.variantId ?? route.variant_id;

  if (input.transportTypeId !== undefined || input.variantId !== undefined) {
    await verifyRouteVariant(client, nextTransportTypeId, nextVariantId);
    updates.transport_type_id = nextTransportTypeId;
    updates.variant_id = nextVariantId;
  }

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.moderationStatus !== undefined) {
    updates.moderation_status = input.moderationStatus;
    updates.is_approved = input.moderationStatus === "approved";
    updates.moderated_by = adminUserId;
    updates.moderated_at = new Date().toISOString();
  }

  if (input.moderationNote !== undefined) {
    updates.moderation_note = input.moderationNote;
  }

  if (input.isActive !== undefined) {
    updates.is_active = input.isActive;
  }

  // Validate stop references before any write so a rejected edit cannot
  // leave the route in a half-updated state.
  if (input.stops !== undefined) {
    await verifyRoutePoints(client, input.stops);
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await client
      .from("routes")
      .update(updates)
      .eq("id", routeId);
    if (updateError) throw updateError;
  }

  if (input.stops !== undefined) {
    await replaceRouteStops(client, routeId, input.stops);
  }
}

export async function deleteAdminRoute(
  client: SupabaseClient,
  routeId: number,
  adminUserId: string,
): Promise<void> {
  const { data: deleted, error } = await client
    .from("routes")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: adminUserId,
      is_active: false,
    })
    .eq("id", routeId)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (deleted) return;

  // No live route was updated: either the route never existed or it is
  // already soft-deleted. Only a missing route is an error; deleting an
  // already-deleted route succeeds idempotently.
  const { data: existing, error: lookupError } = await client
    .from("routes")
    .select("id")
    .eq("id", routeId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!existing) {
    throw new AdminNotFoundError("Route not found.");
  }
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
