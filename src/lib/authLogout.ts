import { supabase } from "./supabase";

// ============================================================
// LOGOUT STATE
// ============================================================

let logoutInProgress: Promise<void> | null = null;

// ============================================================
// STORAGE CLEANUP
// ============================================================

function clearQRouteSessionStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem("qroute_current_user");
  } catch (error) {
    console.warn(
      "Could not clear QRoute local session storage:",
      error,
    );
  }

  try {
    window.sessionStorage.removeItem("qroute_current_user");
  } catch (error) {
    console.warn(
      "Could not clear QRoute temporary session storage:",
      error,
    );
  }
}

// ============================================================
// CURRENT-DEVICE LOGOUT
// ============================================================

/**
 * Signs out the current browser/device only.
 *
 * Concurrent logout calls share the same operation.
 *
 * Supabase removes the local session before attempting
 * best-effort server-side refresh-token revocation.
 *
 * A returned Supabase error therefore does not necessarily
 * mean that the browser remains authenticated.
 *
 * This deliberately does not:
 * - Sign out other devices.
 * - Clear the remembered login identifier.
 * - Clear password-recovery client storage.
 * - Clear legacy storage after an asynchronous operation.
 * - Perform cleanup for a different authentication transaction.
 */
export function logoutCurrentDevice(): Promise<void> {
  if (logoutInProgress) {
    return logoutInProgress;
  }

  // Clear legacy QRoute metadata before the asynchronous
  // Supabase sign-out operation begins. Never perform this
  // cleanup after awaiting signOut(), because another
  // authentication transaction could have started meanwhile.
  clearQRouteSessionStorage();

  const operation = Promise.resolve().then(async () => {
    const { error } = await supabase.auth.signOut({
      scope: "local",
    });

    if (error) {
      // Supabase has already removed the local session for
      // scope "local". This error concerns best-effort
      // server-side refresh-token revocation.
      console.warn(
        "QRoute signed out locally, but server-side refresh-token revocation could not be confirmed:",
        error,
      );
    }
  });

  let sharedOperation: Promise<void>;

  sharedOperation = operation.finally(() => {
    if (logoutInProgress === sharedOperation) {
      logoutInProgress = null;
    }
  });

  logoutInProgress = sharedOperation;

  return sharedOperation;
}