
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { assertPublicSupabaseKey } from "./supabaseConfig";

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

const supabasePublishableKey = assertPublicSupabaseKey(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

if (!supabaseUrl) {
  throw new Error(
    "Supabase environment variables are missing.",
  );
}

// ============================================================
// RECOVERY CLIENT CONFIGURATION
// ============================================================

/**
 * This storage key MUST remain different from the primary
 * QRoute Supabase client's storage key.
 *
 * That prevents recovery sessions from replacing ordinary
 * authenticated sessions in the same browser.
 */
const RECOVERY_STORAGE_KEY =
  "qroute-password-recovery-auth-token";

/**
 * Only these application routes may initialize the
 * password-recovery client.
 */
const RECOVERY_PATHS = new Set([
  "/resetpassword",
  "/reset-password",
]);

/**
 * Identifies the exact recovery session that may be cleared.
 *
 * Both values must match. A matching user ID alone is not
 * sufficient because the same account can start another
 * recovery session.
 */
export interface RecoverySessionIdentity {
  userId: string;
  accessToken: string;
}

let recoveryClient: SupabaseClient | null = null;

// ============================================================
// ROUTE VALIDATION
// ============================================================

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");

  return normalized || "/";
}

function isPasswordRecoveryRoute(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return RECOVERY_PATHS.has(
    normalizePathname(window.location.pathname),
  );
}

// ============================================================
// CLIENT INITIALIZATION
// ============================================================

/**
 * Returns the dedicated password-recovery client.
 *
 * This client:
 *
 * - Uses a separate Supabase storage key.
 * - Uses implicit flow for the existing recovery-link flow.
 * - Persists the recovery session independently.
 * - Does not automatically refresh recovery tokens.
 * - Detects recovery credentials in the callback URL.
 *
 * It must only be initialized on a password-reset route.
 *
 * The primary QRoute Supabase client is never modified
 * by this function.
 */
export function getPasswordRecoveryClient(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error(
      "The password-recovery client is only available in the browser.",
    );
  }

  if (!isPasswordRecoveryRoute()) {
    throw new Error(
      "The password-recovery client cannot be initialized outside a password-reset route.",
    );
  }

  if (recoveryClient) {
    return recoveryClient;
  }

  recoveryClient = createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        flowType: "implicit",

        storageKey: RECOVERY_STORAGE_KEY,

        persistSession: true,

        autoRefreshToken: false,

        detectSessionInUrl: true,
      },
    },
  );

  return recoveryClient;
}

// ============================================================
// RECOVERY SESSION CLEANUP
// ============================================================

/**
 * Clears only the dedicated password-recovery client's
 * local session.
 *
 * This never signs out the primary QRoute Supabase client.
 *
 * When expectedSession is supplied, the helper first checks
 * that the currently stored recovery session still belongs
 * to that exact user and access token.
 *
 * If another recovery session has replaced it, the helper
 * returns false without signing out the replacement session.
 *
 * Returns:
 *
 * - true: The recovery session was already absent or the
 *   expected session was cleared locally.
 * - false: A different recovery session is currently active,
 *   so it was deliberately left untouched.
 *
 * A server-side refresh-token revocation error is logged
 * as a warning because Supabase removes the local session
 * before attempting best-effort revocation for scope local.
 */
export async function clearPasswordRecoverySession(
  expectedSession?: RecoverySessionIdentity,
): Promise<boolean> {
  const client = recoveryClient;

  // No recovery client was initialized. There is no active
  // in-memory recovery client to sign out.
  if (!client) {
    return true;
  }

  // ----------------------------------------------------------
  // 1. READ THE CURRENT RECOVERY SESSION
  // ----------------------------------------------------------

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  // No recovery session remains to clear.
  if (!session) {
    return true;
  }

  // ----------------------------------------------------------
  // 2. VERIFY THE EXPECTED RECOVERY SESSION
  // ----------------------------------------------------------

  if (expectedSession) {
    const matchesExpectedSession =
      session.user.id === expectedSession.userId &&
      session.access_token ===
        expectedSession.accessToken;

    if (!matchesExpectedSession) {
      /**
       * Do not sign out a newer recovery session.
       *
       * The caller can still report that the password
       * update succeeded, while explaining that the
       * replacement recovery session was left untouched.
       */
      return false;
    }
  }

  // ----------------------------------------------------------
  // 3. CLEAR ONLY THE RECOVERY CLIENT'S LOCAL SESSION
  // ----------------------------------------------------------

  const { error: signOutError } =
    await client.auth.signOut({
      scope: "local",
    });

  if (signOutError) {
    console.warn(
      "The password-recovery session was cleared locally, but server-side refresh-token revocation could not be confirmed:",
      signOutError,
    );
  }

  return true;
}
