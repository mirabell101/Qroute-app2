const SECRET_KEY_PREFIX = "sb_secret_";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = globalThis.atob(padded);
    const payload: unknown = JSON.parse(json);

    return payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Guards against accidentally shipping a Supabase secret key to the browser.
 *
 * Vite exposes every VITE_* variable in the client bundle, so a typo such as
 * putting SUPABASE_SECRET_KEY into VITE_SUPABASE_PUBLISHABLE_KEY would leak
 * full database access. The client must fail closed instead.
 */
export function assertPublicSupabaseKey(key: string | null | undefined): string {
  const trimmed = key?.trim() ?? "";

  if (!trimmed) {
    throw new Error("Supabase publishable key is missing.");
  }

  if (trimmed.toLowerCase().startsWith(SECRET_KEY_PREFIX)) {
    throw new Error(
      "A Supabase secret key was supplied to the browser client. Use the publishable key instead."
    );
  }

  const payload = decodeJwtPayload(trimmed);

  if (
    payload?.role === "service_role" ||
    payload?.role === "supabase_admin"
  ) {
    throw new Error(
      "A privileged Supabase key was supplied to the browser client. Use the publishable key instead."
    );
  }

  return trimmed;
}
