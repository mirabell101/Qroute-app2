import { API_BASE_URL } from "./api";
import { resolvePostAuthPath } from "./authRedirect";
import {
  resolveUserRole,
  roleLandingPath,
  type QRouteRole,
} from "./roles";
import { supabase } from "./supabase";

export const AUTH_ROLE_UPDATED_EVENT = "qroute:auth-role-updated";

type SessionResponse = {
  success?: boolean;
  role?: unknown;
  message?: string;
};

/**
 * Reads the signed-in user's role from the database.
 *
 * This is used for navigation and UI guards. Backend writes still enforce
 * authorization independently through `requireAuth`, `requireRegisteredUser`,
 * and Supabase RLS.
 */
export async function getUserRole(
  userId: string
): Promise<QRouteRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  const roles = (data ?? [])
    .map((row) => row.role)
    .filter((role): role is string => typeof role === "string");

  return resolveUserRole(roles);
}

/**
 * Completes both Google and email/password sign-in through one trusted path.
 *
 * The Express endpoint verifies the access token, ensures a brand-new account
 * has only the default `registered_user` role, and returns the role stored in
 * the database. The browser never sends a role value.
 */
export async function completeSignIn(
  accessToken: string,
  requestedPath?: string | null
): Promise<string> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/auth/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new Error(
      "Unable to reach the QRoute server to verify your account."
    );
  }

  const result = (await response
    .json()
    .catch(() => null)) as SessionResponse | null;

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message || "Unable to verify your account permissions."
    );
  }

  const role = resolveUserRole([
    typeof result.role === "string" ? result.role : "",
  ]);

  if (!role) {
    throw new Error("Your account does not have a valid QRoute role.");
  }

  // Tell the app shell to reload the role from the database. This covers the
  // short race between the OAuth/password session event and role provisioning.
  window.dispatchEvent(new Event(AUTH_ROLE_UPDATED_EVENT));

  return resolvePostAuthPath(requestedPath, roleLandingPath(role));
}

export function completeGoogleSignIn(accessToken: string): Promise<string> {
  // Do not pass a hardcoded fallback path here. The session endpoint returns
  // the user's real role, and completeSignIn resolves the destination from
  // that role via roleLandingPath. Passing "/home" would override the
  // role-based destination, sending admins to the user homepage instead of
  // the admin dashboard.
  return completeSignIn(accessToken, null);
}
