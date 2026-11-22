
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;

const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

// ============================================================
// SERVER CLIENT CONFIGURATION
// ============================================================

/**
 * Express clients must not persist sessions, refresh tokens,
 * or process browser authentication callbacks.
 *
 * Each operation receives its own client instance.
 */
const SERVER_AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

// ============================================================
// CONFIGURATION HELPERS
// ============================================================

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl && supabasePublishableKey,
  );
}

export function getSupabaseUrlSafe(): string | null {
  if (!supabaseUrl) {
    return null;
  }

  return supabaseUrl;
}

// ============================================================
// STANDARD SUPABASE CLIENT
// ============================================================

/**
 * Stateless client for standard backend Supabase operations.
 *
 * Does not preserve authentication state between requests.
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        ...SERVER_AUTH_OPTIONS,
      },
    },
  );
}

// ============================================================
// REQUEST-SCOPED AUTHENTICATED CLIENT
// ============================================================

/**
 * Creates a client for one authenticated request.
 *
 * Preserves the caller's identity so PostgreSQL RLS policies
 * execute with the authenticated user's permissions.
 *
 * Never replace this with the privileged admin client for
 * ordinary user operations.
 */
export function getSupabaseClientForAccessToken(
  accessToken: string,
) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY",
    );
  }

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim()
  ) {
    throw new Error(
      "A valid Supabase access token is required.",
    );
  }

  return createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        ...SERVER_AUTH_OPTIONS,
      },
    },
  );
}

// ============================================================
// PASSWORD UPDATE ERROR
// ============================================================

export class SupabaseUserUpdateError extends Error {
  constructor(
    public readonly status: number,
  ) {
    super("Supabase Auth user update failed.");

    this.name = "SupabaseUserUpdateError";
  }
}

// ============================================================
// PASSWORD UPDATE
// ============================================================

/**
 * Updates the authenticated user's password using their
 * own access token.
 *
 * This deliberately does not use the Supabase admin API.
 */
export async function updateSupabaseUserPassword(
  accessToken: string,
  password: string,
): Promise<void> {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing Supabase Auth configuration.",
    );
  }

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim()
  ) {
    throw new Error(
      "A valid Supabase access token is required.",
    );
  }

  const response = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    {
      method: "PUT",
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    },
  );

  if (!response.ok) {
    throw new SupabaseUserUpdateError(
      response.status,
    );
  }
}

// ============================================================
// PRIVILEGED SUPABASE CLIENT
// ============================================================

/**
 * Privileged client for trusted backend operations only.
 *
 * Never expose this client or its secret key to the browser.
 */
export function getSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY",
    );
  }

  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        ...SERVER_AUTH_OPTIONS,
      },
    },
  );
}
