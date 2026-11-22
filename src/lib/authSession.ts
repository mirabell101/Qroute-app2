
import { API_BASE_URL } from "./api";
import { resolvePostAuthPath } from "./authRedirect";
import {
  resolveUserRole,
  roleLandingPath,
  type QRouteRole,
} from "./roles";
import { supabase } from "./supabase";
import { getStoredAccountDisplayName } from "./accountApi";

import {
  getSessionSnapshot,
  isCurrentAuthenticatedSession,
  isCurrentSessionAccessToken,
  subscribeSessionState,
  type SessionIdentity,
} from "./sessionCoordinator";

// ============================================================
// TYPES
// ============================================================

export const AUTH_ROLE_UPDATED_EVENT =
  "qroute:auth-role-updated";

interface SessionResponse {
  success?: boolean;
  role?: unknown;
  message?: string;
}

interface JwtSessionClaims {
  sub?: unknown;
  session_id?: unknown;
}

const SESSION_VALIDATION_TIMEOUT_MS = 15_000;
const MAX_SESSION_STABILIZATION_ATTEMPTS = 3;

// ============================================================
// SESSION IDENTITY HELPERS
// ============================================================

function sameSessionIdentity(
  first: SessionIdentity | null | undefined,
  second: SessionIdentity | null | undefined,
): boolean {
  if (!first || !second) {
    return false;
  }

  return (
    first.userId === second.userId &&
    first.sessionId === second.sessionId &&
    first.generation === second.generation
  );
}

// ============================================================
// JWT CLAIM HELPERS
// ============================================================

/**
 * Decodes JWT claims only for comparing session identities.
 *
 * This does NOT verify the JWT and must never be used
 * to authorize a user.
 *
 * Actual authentication validation is performed through
 * Supabase Auth and the QRoute backend.
 */
function readSessionClaims(
  accessToken: string,
): JwtSessionClaims | null {
  try {
    const parts = accessToken.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const paddedBase64 = base64.padEnd(
      Math.ceil(base64.length / 4) * 4,
      "=",
    );

    const binary = atob(paddedBase64);

    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0),
    );

    const decoded = new TextDecoder().decode(bytes);
    const value: unknown = JSON.parse(decoded);

    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return null;
    }

    return value as JwtSessionClaims;
  } catch {
    return null;
  }
}

/**
 * Determines whether two access tokens belong to the same
 * Supabase session.
 *
 * Exact token equality is accepted.
 *
 * Otherwise, both tokens must contain matching session IDs
 * and user subjects.
 *
 * A user ID by itself is not sufficient.
 */
function tokensBelongToSameSession(
  suppliedToken: string,
  currentToken: string,
): boolean {
  if (!suppliedToken || !currentToken) {
    return false;
  }

  if (suppliedToken === currentToken) {
    return true;
  }

  const suppliedClaims =
    readSessionClaims(suppliedToken);

  const currentClaims =
    readSessionClaims(currentToken);

  return (
    typeof suppliedClaims?.session_id === "string" &&
    typeof currentClaims?.session_id === "string" &&
    suppliedClaims.session_id ===
      currentClaims.session_id &&
    typeof suppliedClaims.sub === "string" &&
    suppliedClaims.sub === currentClaims.sub
  );
}

// ============================================================
// AUTHENTICATED SESSION WAITING
// ============================================================

/**
 * Waits until the coordinator has independently validated
 * the exact Supabase session associated with the supplied token.
 *
 * The waiter:
 *
 * - Accepts token refreshes belonging to the same session.
 * - Rejects a different active session generation when one
 *   is expected.
 * - Rejects password-recovery sessions.
 * - Rejects coordinator validation failures.
 * - Times out rather than accepting an unverified session.
 */
function waitForAuthenticatedIdentity(
  accessToken: string,
  userId: string,
  expectedIdentity?: SessionIdentity,
): Promise<SessionIdentity> {
  return new Promise<SessionIdentity>((resolve, reject) => {
    let settled = false;

    let unsubscribe: (() => void) | null = null;

    let timeoutId:
      | ReturnType<typeof setTimeout>
      | null = null;

    const initialSnapshot = getSessionSnapshot();
    const initialIdentity = initialSnapshot.identity;

    const finish = (
      callback: () => void,
    ): void => {
      if (settled) {
        return;
      }

      settled = true;

      unsubscribe?.();
      unsubscribe = null;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      callback();
    };

    const rejectSessionChanged = (): void => {
      finish(() => {
        reject(
          new Error(
            "Your authentication session changed during this operation. Please try again.",
          ),
        );
      });
    };

    const checkSession = (): void => {
      if (settled) {
        return;
      }

      const current = getSessionSnapshot();

      const currentIdentity = current.identity;

      const tokenMatchesCurrentSession =
        isCurrentSessionAccessToken(accessToken);

      // ------------------------------------------------------
      // AUTHENTICATION VALIDATION FAILURE
      // ------------------------------------------------------

      if (
        current.status === "error" &&
        tokenMatchesCurrentSession
      ) {
        finish(() => {
          reject(
            new Error(
              current.error ??
                "Unable to validate your authentication session.",
            ),
          );
        });

        return;
      }

      // ------------------------------------------------------
      // EXPECTED SESSION IDENTITY
      // ------------------------------------------------------

      if (expectedIdentity) {
        if (
          currentIdentity &&
          !sameSessionIdentity(
            currentIdentity,
            expectedIdentity,
          ) &&
          !tokenMatchesCurrentSession
        ) {
          rejectSessionChanged();
          return;
        }

        if (
          !currentIdentity &&
          current.status === "unauthenticated"
        ) {
          rejectSessionChanged();
          return;
        }
      } else {
        // ----------------------------------------------------
        // INITIAL SESSION IDENTITY
        // ----------------------------------------------------

        if (
          currentIdentity &&
          initialIdentity &&
          !sameSessionIdentity(
            currentIdentity,
            initialIdentity,
          ) &&
          !tokenMatchesCurrentSession
        ) {
          rejectSessionChanged();
          return;
        }

        if (
          currentIdentity &&
          !initialIdentity &&
          current.status !== "initializing" &&
          !tokenMatchesCurrentSession
        ) {
          rejectSessionChanged();
          return;
        }

        if (
          !currentIdentity &&
          initialIdentity &&
          current.status === "unauthenticated"
        ) {
          rejectSessionChanged();
          return;
        }
      }

      // ------------------------------------------------------
      // TOKEN OWNERSHIP
      // ------------------------------------------------------

      /**
       * Do not accept an identity merely because its user ID
       * matches. The access token must belong to the active
       * Supabase session.
       */
      if (!tokenMatchesCurrentSession) {
        return;
      }

      if (!currentIdentity) {
        return;
      }

      if (currentIdentity.userId !== userId) {
        rejectSessionChanged();
        return;
      }

      if (
        expectedIdentity &&
        !sameSessionIdentity(
          currentIdentity,
          expectedIdentity,
        )
      ) {
        rejectSessionChanged();
        return;
      }

      // ------------------------------------------------------
      // PASSWORD RECOVERY SESSION
      // ------------------------------------------------------

      if (
        current.status === "password_recovery" ||
        current.purpose === "password_recovery"
      ) {
        finish(() => {
          reject(
            new Error(
              "Password recovery sessions cannot complete normal sign-in.",
            ),
          );
        });

        return;
      }

      // ------------------------------------------------------
      // VERIFIED AUTHENTICATED SESSION
      // ------------------------------------------------------

      if (
        current.status === "authenticated" &&
        current.purpose === "authenticated" &&
        isCurrentAuthenticatedSession(currentIdentity)
      ) {
        finish(() => {
          resolve(currentIdentity);
        });
      }

      // "initializing" and "validating" deliberately remain
      // pending. The coordinator will notify this waiter
      // when the session reaches a final state.
    };

    // Subscribe before checking so state changes cannot be missed.
    const stopListening =
      subscribeSessionState(checkSession);

    unsubscribe = stopListening;

    /**
     * Some subscription implementations may notify immediately.
     * In that case, checkSession could already have settled the
     * promise before subscribeSessionState returned.
     */
    if (settled) {
      unsubscribe?.();
      unsubscribe = null;
      return;
    }

    timeoutId = setTimeout(() => {
      finish(() => {
        reject(
          new Error(
            "Your authentication session could not be verified. Please sign in again.",
          ),
        );
      });
    }, SESSION_VALIDATION_TIMEOUT_MS);

    // Check immediately in case validation completed before
    // the subscription was registered.
    checkSession();
  });
}

// ============================================================
// CURRENT SESSION VERIFICATION
// ============================================================

/**
 * Confirms that the expected identity is still the active
 * browser session.
 *
 * A refreshed token is accepted only if it belongs to the
 * same Supabase session and generation.
 *
 * Returns the latest stabilized access token.
 */
async function assertCurrentSession(
  identity: SessionIdentity,
  suppliedAccessToken: string,
): Promise<string> {
  if (!suppliedAccessToken?.trim()) {
    throw new Error(
      "An authentication token is required.",
    );
  }

  for (
    let attempt = 0;
    attempt < MAX_SESSION_STABILIZATION_ATTEMPTS;
    attempt += 1
  ) {
    // --------------------------------------------------------
    // 1. READ THE CURRENT BROWSER SESSION
    // --------------------------------------------------------

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw new Error(
        "Unable to inspect the current authentication session.",
      );
    }

    if (!session) {
      throw new Error(
        "There is no active authentication session.",
      );
    }

    if (session.user.id !== identity.userId) {
      throw new Error(
        "The authenticated account changed during this operation.",
      );
    }

    // --------------------------------------------------------
    // 2. CONFIRM TOKEN SESSION OWNERSHIP
    // --------------------------------------------------------

    if (
      !tokensBelongToSameSession(
        suppliedAccessToken,
        session.access_token,
      )
    ) {
      throw new Error(
        "Your authentication session changed during this operation. Please try again.",
      );
    }

    // --------------------------------------------------------
    // 3. WAIT FOR COORDINATOR VALIDATION
    // --------------------------------------------------------

    const validatedIdentity =
      await waitForAuthenticatedIdentity(
        session.access_token,
        session.user.id,
        identity,
      );

    if (
      !sameSessionIdentity(
        validatedIdentity,
        identity,
      )
    ) {
      throw new Error(
        "Your authentication session changed during this operation.",
      );
    }

    // --------------------------------------------------------
    // 4. RE-READ THE SESSION AFTER VALIDATION
    // --------------------------------------------------------

    const {
      data: { session: latestSession },
      error: latestSessionError,
    } = await supabase.auth.getSession();

    if (latestSessionError || !latestSession) {
      throw new Error(
        "Unable to confirm the current authentication session.",
      );
    }

    if (latestSession.user.id !== identity.userId) {
      throw new Error(
        "The authenticated account changed during this operation.",
      );
    }

    if (
      !tokensBelongToSameSession(
        suppliedAccessToken,
        latestSession.access_token,
      )
    ) {
      throw new Error(
        "A different authentication session became active.",
      );
    }

    /**
     * If the access token changed during validation,
     * repeat validation using the newest session token.
     */
    if (
      latestSession.access_token !== session.access_token
    ) {
      continue;
    }

    // --------------------------------------------------------
    // 5. CONFIRM THE GENERATION IS STILL AUTHENTICATED
    // --------------------------------------------------------

    if (
      isCurrentAuthenticatedSession(identity) &&
      isCurrentSessionAccessToken(
        latestSession.access_token,
      )
    ) {
      return latestSession.access_token;
    }

    /**
     * The coordinator may have started another validation
     * for the same identity. Retry rather than accepting
     * an unverified snapshot.
     */
  }

  throw new Error(
    "Your authentication session could not be stabilized. Please try again.",
  );
}

// ============================================================
// RESOLVE AUTHENTICATED IDENTITY
// ============================================================

/**
 * Resolves the coordinator identity associated with the
 * supplied access token.
 *
 * The browser session must correspond to that token before
 * the coordinator can validate the identity.
 */
async function requireAuthenticatedIdentity(
  accessToken: string,
  expectedUserId?: string,
): Promise<SessionIdentity> {
  if (!accessToken?.trim()) {
    throw new Error(
      "An authentication token is required.",
    );
  }

  // ----------------------------------------------------------
  // 1. READ THE CURRENT SUPABASE SESSION
  // ----------------------------------------------------------

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(
      "Unable to inspect the current authentication session.",
    );
  }

  if (!session) {
    throw new Error(
      "There is no active authentication session.",
    );
  }

  // ----------------------------------------------------------
  // 2. VERIFY THE SUPPLIED TOKEN BELONGS TO THIS SESSION
  // ----------------------------------------------------------

  if (
    !tokensBelongToSameSession(
      accessToken,
      session.access_token,
    )
  ) {
    throw new Error(
      "The supplied authentication token does not belong to the current session.",
    );
  }

  const tokenClaims = readSessionClaims(accessToken);

  if (
    typeof tokenClaims?.sub === "string" &&
    tokenClaims.sub !== session.user.id
  ) {
    throw new Error(
      "The authentication token does not match the active account.",
    );
  }

  // ----------------------------------------------------------
  // 3. CHECK THE EXPECTED ACCOUNT
  // ----------------------------------------------------------

  if (
    expectedUserId &&
    session.user.id !== expectedUserId
  ) {
    throw new Error(
      "The authenticated account does not match the expected account.",
    );
  }

  // ----------------------------------------------------------
  // 4. WAIT FOR THE COORDINATOR
  // ----------------------------------------------------------

  const identity =
    await waitForAuthenticatedIdentity(
      session.access_token,
      session.user.id,
    );

  // ----------------------------------------------------------
  // 5. CONFIRM THE SESSION HAS NOT BEEN REPLACED
  // ----------------------------------------------------------

  await assertCurrentSession(identity, accessToken);

  return identity;
}

// ============================================================
// ROLE LOOKUP
// ============================================================

/**
 * Loads the role assigned to a user.
 *
 * When an expected identity is provided, the lookup is
 * accepted only while that authenticated session generation
 * remains active.
 *
 * The optional identity preserves compatibility with callers
 * that have not yet migrated to generation-aware checks.
 */
export async function getUserRole(
  userId: string,
  expectedIdentity?: SessionIdentity,
): Promise<QRouteRole | null> {
  if (!userId) {
    throw new Error(
      "A user ID is required to retrieve the account role.",
    );
  }

  if (expectedIdentity) {
    if (expectedIdentity.userId !== userId) {
      throw new Error(
        "The expected session does not belong to this user.",
      );
    }

    await assertCurrentSessionForIdentity(
      expectedIdentity,
    );
  }

  // ----------------------------------------------------------
  // ROLE QUERY
  // ----------------------------------------------------------

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  // ----------------------------------------------------------
  // REVALIDATE AFTER THE ASYNC QUERY
  // ----------------------------------------------------------

  if (expectedIdentity) {
    await assertCurrentSessionForIdentity(
      expectedIdentity,
    );
  }

  const roles = (data ?? [])
    .map((row) => row.role)
    .filter(
      (role): role is string =>
        typeof role === "string",
    );

  return resolveUserRole(roles);
}

/**
 * Ensures a role lookup remains associated with the exact
 * authenticated identity supplied by its caller.
 */
async function assertCurrentSessionForIdentity(
  identity: SessionIdentity,
): Promise<void> {
  if (!identity.userId) {
    throw new Error(
      "The expected authenticated identity is invalid.",
    );
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error(
      "The active authentication session could not be verified.",
    );
  }

  if (session.user.id !== identity.userId) {
    throw new Error(
      "The authenticated account changed while loading the role.",
    );
  }

  const currentIdentity =
    await waitForAuthenticatedIdentity(
      session.access_token,
      session.user.id,
      identity,
    );

  if (
    !sameSessionIdentity(
      currentIdentity,
      identity,
    )
  ) {
    throw new Error(
      "The authentication session changed while loading the role.",
    );
  }

  await assertCurrentSession(
    identity,
    session.access_token,
  );
}

// ============================================================
// NORMAL SIGN-IN COMPLETION
// ============================================================

/**
 * Completes a normal authenticated sign-in.
 *
 * The backend remains responsible for:
 * - Verifying the supplied access token.
 * - Checking the user's account state.
 * - Enforcing QRoute authorization.
 * - Returning the authoritative QRoute role.
 *
 * The response is accepted only while the same session
 * generation remains active.
 */
export async function completeSignIn(
  accessToken: string,
  requestedPath?: string | null,
): Promise<string> {
  // ----------------------------------------------------------
  // 1. VALIDATE THE SUPABASE SESSION
  // ----------------------------------------------------------

  const identity =
    await requireAuthenticatedIdentity(accessToken);

  // ----------------------------------------------------------
  // 2. GET THE LATEST VALIDATED TOKEN
  // ----------------------------------------------------------

  const requestAccessToken =
    await assertCurrentSession(
      identity,
      accessToken,
    );

  // ----------------------------------------------------------
  // 3. REQUEST AUTHORITATIVE QROUTE SESSION INFORMATION
  // ----------------------------------------------------------

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/auth/session`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requestAccessToken}`,
        },
      },
    );
  } catch {
    // Do not report an ordinary network error if the
    // authentication session was replaced during the request.
    await assertCurrentSession(
      identity,
      requestAccessToken,
    );

    throw new Error(
      "Unable to reach the QRoute server to verify your account.",
    );
  }

  // ----------------------------------------------------------
  // 4. VALIDATE SESSION AFTER THE NETWORK REQUEST
  // ----------------------------------------------------------

  await assertCurrentSession(
    identity,
    requestAccessToken,
  );

  // ----------------------------------------------------------
  // 5. PARSE THE SERVER RESPONSE
  // ----------------------------------------------------------

  const rawResult: unknown = await response
    .json()
    .catch(() => null);

  await assertCurrentSession(
    identity,
    requestAccessToken,
  );

  const result =
    typeof rawResult === "object" &&
    rawResult !== null &&
    !Array.isArray(rawResult)
      ? (rawResult as SessionResponse)
      : null;

  if (!response.ok || result?.success !== true) {
    throw new Error(
      result?.message ||
        "Unable to verify your account permissions.",
    );
  }

  // ----------------------------------------------------------
  // 6. RESOLVE THE AUTHORITATIVE QROUTE ROLE
  // ----------------------------------------------------------

  const role = resolveUserRole([
    typeof result.role === "string"
      ? result.role
      : "",
  ]);

  if (!role) {
    throw new Error(
      "Your account does not have a valid QRoute role.",
    );
  }

  // ----------------------------------------------------------
  // 7. FINAL SESSION VALIDATION
  // ----------------------------------------------------------

  await assertCurrentSession(
    identity,
    requestAccessToken,
  );

  // ----------------------------------------------------------
  // 8. NOTIFY THE APPLICATION
  // ----------------------------------------------------------

  window.dispatchEvent(
    new Event(AUTH_ROLE_UPDATED_EVENT),
  );

  // ----------------------------------------------------------
  // 9. RESOLVE THE APPROVED DESTINATION
  // ----------------------------------------------------------

  return resolvePostAuthPath(
    requestedPath,
    roleLandingPath(role),
  );
}

// ============================================================
// GOOGLE SIGN-IN COMPLETION
// ============================================================

/**
 * Only deduplicates completion operations for the same
 * user and session generation.
 *
 * Different users and new authenticated sessions never
 * share the same promise.
 */
const googleSignInCompletions =
  new Map<string, Promise<string>>();

function getIdentityKey(
  identity: SessionIdentity,
): string {
  return [
    identity.userId,
    identity.sessionId,
    identity.generation,
  ].join(":");
}

/**
 * Completes Google sign-in.
 *
 * 1. Confirms the exact authenticated session.
 * 2. Verifies the QRoute role through the backend.
 * 3. Checks the actual stored profiles.display_name.
 * 4. Redirects to mandatory Display Name completion when missing.
 *
 * Google provider metadata is not used as a replacement
 * for the stored Display Name.
 */
export async function completeGoogleSignIn(
  accessToken: string,
  userId: string,
): Promise<string> {
  // ----------------------------------------------------------
  // 1. VERIFY THE AUTHENTICATED IDENTITY
  // ----------------------------------------------------------

  const identity =
    await requireAuthenticatedIdentity(
      accessToken,
      userId,
    );

  const completionKey = getIdentityKey(identity);

  // ----------------------------------------------------------
  // 2. REUSE ONLY THE SAME SESSION'S PENDING COMPLETION
  // ----------------------------------------------------------

  const existingCompletion =
    googleSignInCompletions.get(completionKey);

  if (existingCompletion) {
    return existingCompletion;
  }

  // ----------------------------------------------------------
  // 3. START GOOGLE COMPLETION
  // ----------------------------------------------------------

  const completion = (async (): Promise<string> => {
    const normalDestination =
      await completeSignIn(accessToken, null);

    await assertCurrentSession(
      identity,
      accessToken,
    );

    // --------------------------------------------------------
    // 4. READ THE STORED DISPLAY NAME
    // --------------------------------------------------------

    const storedDisplayName =
      await getStoredAccountDisplayName(userId);

    // --------------------------------------------------------
    // 5. VERIFY THE SAME SESSION STILL OWNS THE RESULT
    // --------------------------------------------------------

    await assertCurrentSession(
      identity,
      accessToken,
    );

    // Whitespace-only names should not satisfy the
    // mandatory stored Display Name requirement.
    if (
      typeof storedDisplayName !== "string" ||
      !storedDisplayName.trim()
    ) {
      return "/register-user/display-name-gauth";
    }

    return normalDestination;
  })();

  googleSignInCompletions.set(
    completionKey,
    completion,
  );

  try {
    return await completion;
  } finally {
    if (
      googleSignInCompletions.get(completionKey) ===
      completion
    ) {
      googleSignInCompletions.delete(completionKey);
    }
  }
}
