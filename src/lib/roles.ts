/**
 * QRoute role names that the application understands.
 *
 * A user's role is always read from the database (`public.user_roles`).
 * Never derive a role from an email address, a provider name, or frontend
 * form data.
 */
export const DEFAULT_USER_ROLE = "registered_user" as const;

export type QRouteRole = "admin" | typeof DEFAULT_USER_ROLE;

const KNOWN_ROLES: readonly string[] = ["admin", DEFAULT_USER_ROLE];

/**
 * Picks the highest-privilege role that QRoute actually recognises.
 *
 * Unknown role values are ignored so a malformed or unexpected database
 * value cannot accidentally grant access.
 */
export function resolveUserRole(
  roles: readonly string[] | null | undefined
): QRouteRole | null {
  if (!roles?.length) {
    return null;
  }

  if (roles.includes("admin")) {
    return "admin";
  }

  if (roles.includes(DEFAULT_USER_ROLE)) {
    return DEFAULT_USER_ROLE;
  }

  return null;
}

export function isKnownRole(role: string | null | undefined): role is QRouteRole {
  return typeof role === "string" && KNOWN_ROLES.includes(role);
}

export function roleLandingPath(role: string | null | undefined): string {
  return role === "admin" ? "/admin/dashboard" : "/home";
}
