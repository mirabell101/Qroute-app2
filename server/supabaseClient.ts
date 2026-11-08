
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseUrlSafe(): string | null {
  if (!supabaseUrl) {
    return null;
  }

  return supabaseUrl;
}

// Regular client for standard Supabase operations.
export function getSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return createClient(supabaseUrl, supabasePublishableKey);
}

// Request-scoped client: preserves the caller's identity so database RLS runs
// for Express writes instead of granting the API service elevated access.
export function getSupabaseClientForAccessToken(accessToken: string) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export class SupabaseUserUpdateError extends Error {
  constructor(public readonly status: number) {
    super("Supabase Auth user update failed.");
    this.name = "SupabaseUserUpdateError";
  }
}

export async function updateSupabaseUserPassword(
  accessToken: string,
  password: string,
): Promise<void> {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase Auth configuration.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new SupabaseUserUpdateError(response.status);
  }
}

// Privileged client for trusted backend operations only.
export function getSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY"
    );
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
