import type { SupabaseClient } from "@supabase/supabase-js";

const authUsersPerPage = 1000;
const profileBatchSize = 200;

export interface AdminSummary {
  registeredUsers: number;
  routes: number;
  communityPosts: number;
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
}

export async function getAdminSummary(
  client: SupabaseClient,
): Promise<AdminSummary> {
  const [userRolesResult, routesResult, communityPostsResult] =
    await Promise.all([
      client
        .from("user_roles")
        .select("user_id")
        .eq("role", "registered_user"),
      client.from("routes").select("id", { count: "exact", head: true }),
      client
        .from("community_posts")
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

  return {
    registeredUsers: registeredUserIds.size,
    routes: routesResult.count,
    communityPosts: communityPostsResult.count,
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
      return {
        id,
        email: user.email ?? null,
        username: profileUsernames.get(id) ?? null,
        createdAt: user.created_at,
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
