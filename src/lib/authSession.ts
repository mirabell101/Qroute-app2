
import { API_BASE_URL } from "./api";
import { resolvePostAuthPath } from "./authRedirect";
import {
  resolveUserRole,
  roleLandingPath,
  type QRouteRole,
} from "./roles";
import { supabase } from "./supabase";
import { getStoredAccountDisplayName } from "./accountApi";

export const AUTH_ROLE_UPDATED_EVENT = "qroute:auth-role-updated";

type SessionResponse = {
  success?: boolean;
  role?: unknown;
  message?: string;
};

let googleSignInCompletion: Promise<string> | null = null;

export async function getUserRole(
  userId: string,
): Promise<QRouteRole | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const roles = (data ?? [])
    .map((row) => row.role)
    .filter((role): role is string => typeof role === "string");

  return resolveUserRole(roles);
}

export async function completeSignIn(
  accessToken: string,
  requestedPath?: string | null,
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
      "Unable to reach the QRoute server to verify your account.",
    );
  }

  const result = (await response.json().catch(() => null)) as
    | SessionResponse
    | null;

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message || "Unable to verify your account permissions.",
    );
  }

  const role = resolveUserRole([
    typeof result.role === "string" ? result.role : "",
  ]);

  if (!role) {
    throw new Error(
      "Your account does not have a valid QRoute role.",
    );
  }

  window.dispatchEvent(new Event(AUTH_ROLE_UPDATED_EVENT));

  return resolvePostAuthPath(
    requestedPath,
    roleLandingPath(role),
  );
}

/**
 * Google sign-in completion.
 *
 * First verifies the existing server-side authentication and role.
 * Then checks the actual stored profiles.display_name.
 *
 * A missing Display Name redirects to the mandatory completion page.
 */
export async function completeGoogleSignIn(
  accessToken: string,
  userId: string,
): Promise<string> {
  if (!googleSignInCompletion) {
    googleSignInCompletion = (async () => {
      const normalDestination = await completeSignIn(
        accessToken,
        null,
      );

      const storedDisplayName =
        await getStoredAccountDisplayName(userId);

      if (!storedDisplayName) {
        return "/register-user/display-name-gauth";
      }

      return normalDestination;
    })();
  }

  try {
    return await googleSignInCompletion;
  } finally {
    googleSignInCompletion = null;
  }
}
