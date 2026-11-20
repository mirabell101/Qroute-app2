/**
 * QRoute role names that the application understands.
 *
 * A user's role is always read from the database (`public.user_roles`).
 * Never derive a role from an email address, a provider name, or frontend
 * form data.
 */
export const DEFAULT_USER_ROLE = "registered_user" as const;

export const MODERATOR_ROLE = "moderator" as const;

export type QRouteRole =
  | "admin"
  | typeof MODERATOR_ROLE
  | typeof DEFAULT_USER_ROLE;

const KNOWN_ROLES: readonly string[] = [
  "admin",
  MODERATOR_ROLE,
  DEFAULT_USER_ROLE,
];

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

  if (roles.includes(MODERATOR_ROLE)) {
    return MODERATOR_ROLE;
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
  if (role === "admin") return "/admin/base";
  if (role === MODERATOR_ROLE) return "/admin/routes";
  return "/home";
}

/**
 * Returns the role-specific destination when a role must not use the
 * registered-user homepage. Other roles continue through the normal route.
 */
export function homeRedirectPath(
  role: string | null | undefined,
): string | null {
  return role === "admin" ? roleLandingPath(role) : null;
}
