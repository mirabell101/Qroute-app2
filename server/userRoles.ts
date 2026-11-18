import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_USER_ROLE = "registered_user";

const ROLE_PRIORITY = ["admin", DEFAULT_USER_ROLE] as const;

type RoleRow = {
  role?: unknown;
};

function pickExistingRole(rows: readonly RoleRow[] | null | undefined): string | null {
  const roles = (rows ?? [])
    .map((row) => row.role)
    .filter((role): role is string => typeof role === "string" && role.length > 0);

  for (const candidate of ROLE_PRIORITY) {
    if (roles.includes(candidate)) {
      return candidate;
    }
  }

  // Preserve an existing unknown role instead of silently replacing it with
  // the default. The frontend will fail closed for roles it does not know.
  return roles[0] ?? null;
}

/**
 * Returns the user's existing role, or creates the default registered-user
 * role when the account has no role yet.
 *
 * Security properties:
 * - the role value is a server-side constant, never request input;
 * - an existing role (including `admin`) is never overwritten or elevated;
 * - only `registered_user` can be created by this path.
 */
export async function getOrCreateDefaultUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  if (!userId) {
    throw new Error("A verified user ID is required.");
  }

  const firstRead = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (firstRead.error) {
    throw firstRead.error;
  }

  const existingRole = pickExistingRole(firstRead.data as RoleRow[] | null);

  if (existingRole) {
    return existingRole;
  }

  const insertResult = await supabase
    .from("user_roles")
    .insert({
      user_id: userId,
      role: DEFAULT_USER_ROLE,
      assigned_at: new Date().toISOString(),
    })
    .select("role")
    .single();

  if (!insertResult.error) {
    return typeof insertResult.data?.role === "string"
      ? insertResult.data.role
      : DEFAULT_USER_ROLE;
  }

  // A concurrent sign-in may have inserted the role first. Treat the unique
  // conflict as success and read the role that now exists.
  if (insertResult.error.code === "23505") {
    const retryRead = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (!retryRead.error) {
      const role = pickExistingRole(retryRead.data as RoleRow[] | null);

      if (role) {
        return role;
      }
    }
  }

  throw insertResult.error;
}
