
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

// ============================================================
// TYPES
// ============================================================

export type SessionPurpose =
  | "authenticated"
  | "password_recovery";

export type SessionCoordinatorStatus =
  | "initializing"
  | "validating"
  | "authenticated"
  | "password_recovery"
  | "unauthenticated"
  | "error";

export interface SessionIdentity {
  userId: string;
  sessionId: string;
  generation: number;
}

export interface SessionSnapshot {
  status: SessionCoordinatorStatus;
  purpose: SessionPurpose | null;
  identity: SessionIdentity | null;
  user: User | null;
  error: string | null;
}

interface JwtClaims {
  sub?: unknown;
  session_id?: unknown;
  amr?: unknown;
}

const INITIAL_SNAPSHOT: SessionSnapshot = {
  status: "initializing",
  purpose: null,
  identity: null,
  user: null,
  error: null,
};

// ============================================================
// INTERNAL STATE
// ============================================================

let snapshot: SessionSnapshot = INITIAL_SNAPSHOT;

let generationCounter = 0;
let validationCounter = 0;
let lifecycleCounter = 0;
let startCount = 0;

let activeIdentity: SessionIdentity | null = null;
let activeSession: Session | null = null;
let activePurpose: SessionPurpose | null = null;

let authSubscription:
  | { unsubscribe: () => void }
  | null = null;

const listeners = new Set<() => void>();

/**
 * Associates the latest validation request with a session
 * generation.
 *
 * A newer validation replaces the previous request for
 * the same generation.
 *
 * An entry remains present until the corresponding validation
 * successfully completes, fails, or is invalidated.
 *
 * This map also prevents authentication helpers from treating
 * a silently revalidating session as already verified.
 */
const validationRequests = new Map<number, number>();

// ============================================================
// JWT CLAIM HELPERS
// ============================================================

/**
 * Reads JWT claims for local session identification only.
 *
 * This function does NOT verify a JWT and must never be used
 * to authorize a user or grant access.
 *
 * The exact access token is independently verified with
 * Supabase Auth before authenticated state is published.
 */
function readJwtClaims(
  accessToken: string,
): JwtClaims | null {
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

    return value as JwtClaims;
  } catch {
    return null;
  }
}

// ============================================================
// SESSION ID HELPERS
// ============================================================

/**
 * Derives a stable session identifier from the access token.
 *
 * Supabase access tokens contain a session_id claim that
 * uniquely identifies the authenticated session.
 *
 * auth_time is deliberately NOT used as a fallback because
 * it is not a unique session identifier.
 *
 * If session_id is unavailable, a previous local identity
 * may only be reused for events that identify an update or
 * refresh of that same existing session.
 */
function getSessionId(
  claims: JwtClaims | null,
  previousIdentity: SessionIdentity | null,
  previousSession: Session | null,
  session: Session,
  event: string,
): string | null {
  if (
    typeof claims?.session_id === "string" &&
    claims.session_id.trim() &&
    claims.sub === session.user.id
  ) {
    return claims.session_id;
  }

  const previousBelongsToSameUser =
    previousIdentity !== null &&
    previousIdentity.userId === session.user.id;

  if (!previousBelongsToSameUser || !previousIdentity) {
    return null;
  }

  const isSessionUpdate =
    event === "TOKEN_REFRESHED" ||
    event === "USER_UPDATED";

  const isUnchangedInitialSession =
    event === "INITIAL_SESSION" &&
    previousSession?.access_token === session.access_token;

  if (isSessionUpdate || isUnchangedInitialSession) {
    return previousIdentity.sessionId;
  }

  return null;
}

// ============================================================
// PASSWORD RECOVERY DETECTION
// ============================================================

/**
 * Recovery detection reads the amr claim for session
 * classification only.
 *
 * The token must still pass Supabase Auth verification
 * before a password-recovery state is published.
 */
function hasRecoveryAuthenticationMethod(
  claims: JwtClaims | null,
): boolean {
  if (!Array.isArray(claims?.amr)) {
    return false;
  }

  return claims.amr.some((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry)
    ) {
      return false;
    }

    return (
      "method" in entry &&
      entry.method === "recovery"
    );
  });
}

// ============================================================
// IDENTITY COMPARISON
// ============================================================

function sameSessionIdentity(
  first: SessionIdentity | null | undefined,
  second: SessionIdentity | null | undefined,
): boolean {
  return Boolean(
    first &&
      second &&
      first.userId === second.userId &&
      first.sessionId === second.sessionId &&
      first.generation === second.generation,
  );
}

// ============================================================
// STATE PUBLICATION
// ============================================================

function publish(nextSnapshot: SessionSnapshot): void {
  snapshot = nextSnapshot;

  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

export function subscribeSessionState(
  listener: () => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

// ============================================================
// SESSION IDENTITY
// ============================================================

function createSessionIdentity(
  session: Session,
  sessionId: string | null,
  purpose: SessionPurpose,
): SessionIdentity {
  const previousIdentity = activeIdentity;

  const candidateSessionId =
    sessionId ?? `local-${generationCounter + 1}`;

  const sameSession =
    previousIdentity !== null &&
    previousIdentity.userId === session.user.id &&
    previousIdentity.sessionId === candidateSessionId &&
    activePurpose === purpose;

  if (sameSession) {
    return previousIdentity;
  }

  generationCounter += 1;

  return {
    userId: session.user.id,
    sessionId: sessionId ?? `local-${generationCounter}`,
    generation: generationCounter,
  };
}

function identityMatches(
  expected: SessionIdentity,
): boolean {
  return sameSessionIdentity(
    activeIdentity,
    expected,
  );
}

// ============================================================
// CURRENT SESSION VALIDATION HELPERS
// ============================================================

/**
 * Returns true only when the expected session generation
 * is currently active AND has no pending validation request.
 *
 * During silent TOKEN_REFRESHED or repeated SIGNED_IN
 * validation, the displayed snapshot may deliberately remain
 * authenticated so the UI does not flash a loading screen.
 *
 * This helper still returns false until the latest token
 * has successfully passed Supabase Auth verification.
 */
export function isCurrentSession(
  expected: SessionIdentity | null | undefined,
): boolean {
  if (!expected || !identityMatches(expected)) {
    return false;
  }

  const displayedIdentity = snapshot.identity;

  if (
    !sameSessionIdentity(
      displayedIdentity,
      expected,
    )
  ) {
    return false;
  }

  /**
   * Do not report the current session as fully verified
   * while its latest token validation is still pending.
   */
  if (validationRequests.has(expected.generation)) {
    return false;
  }

  return (
    snapshot.status === "authenticated" ||
    snapshot.status === "password_recovery"
  );
}

export function isCurrentAuthenticatedSession(
  expected: SessionIdentity | null | undefined,
): boolean {
  return (
    isCurrentSession(expected) &&
    snapshot.status === "authenticated" &&
    snapshot.purpose === "authenticated"
  );
}

// ============================================================
// SESSION VALIDATION
// ============================================================

/**
 * Independently verifies a Supabase session using the exact
 * access token received from the auth-state event.
 *
 * Validation is deferred to a macrotask so Supabase Auth
 * operations do not execute inside its onAuthStateChange
 * callback while the internal auth lock may be held.
 *
 * A stale request can never publish over a newer request
 * or a different session generation.
 */
function validateSession(
  session: Session,
  identity: SessionIdentity,
  purpose: SessionPurpose,
  lifecycle: number,
): void {
  const requestId = ++validationCounter;

  validationRequests.set(
    identity.generation,
    requestId,
  );

  setTimeout(() => {
    if (
      lifecycle !== lifecycleCounter ||
      !identityMatches(identity) ||
      validationRequests.get(identity.generation) !== requestId
    ) {
      return;
    }

    void (async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(
          session.access_token,
        );

        // ----------------------------------------------------
        // 1. REJECT STALE VALIDATION RESULTS
        // ----------------------------------------------------

        if (
          lifecycle !== lifecycleCounter ||
          !identityMatches(identity) ||
          validationRequests.get(identity.generation) !== requestId
        ) {
          return;
        }

        const latestSession = activeSession;

        /**
         * Another auth event may have installed a newer token.
         *
         * Never publish the result of an obsolete token
         * validation. Validate the latest token instead.
         */
        if (
          latestSession &&
          latestSession.access_token !== session.access_token
        ) {
          validateSession(
            latestSession,
            identity,
            activePurpose ?? purpose,
            lifecycle,
          );

          return;
        }

        // ----------------------------------------------------
        // 2. HANDLE AUTHENTICATION FAILURE
        // ----------------------------------------------------

        if (
          error ||
          !user ||
          user.id !== identity.userId
        ) {
          validationRequests.delete(identity.generation);

          publish({
            status: "error",
            purpose,
            identity,
            user: null,
            error:
              error?.message ??
              "The authenticated account could not be verified.",
          });

          return;
        }

        // ----------------------------------------------------
        // 3. PUBLISH VERIFIED AUTHENTICATION
        // ----------------------------------------------------

        validationRequests.delete(identity.generation);

        publish({
          status:
            purpose === "password_recovery"
              ? "password_recovery"
              : "authenticated",
          purpose,
          identity,
          user,
          error: null,
        });
      } catch (error: unknown) {
        // ----------------------------------------------------
        // 4. REJECT STALE EXCEPTION RESULTS
        // ----------------------------------------------------

        if (
          lifecycle !== lifecycleCounter ||
          !identityMatches(identity) ||
          validationRequests.get(identity.generation) !== requestId
        ) {
          return;
        }

        const latestSession = activeSession;

        /**
         * If a newer token became active during this failed
         * request, retry validation with the newer token.
         */
        if (
          latestSession &&
          latestSession.access_token !== session.access_token
        ) {
          validateSession(
            latestSession,
            identity,
            activePurpose ?? purpose,
            lifecycle,
          );

          return;
        }

        // ----------------------------------------------------
        // 5. PUBLISH VALIDATION FAILURE
        // ----------------------------------------------------

        validationRequests.delete(identity.generation);

        publish({
          status: "error",
          purpose,
          identity,
          user: null,
          error:
            error instanceof Error
              ? error.message
              : "Session validation failed.",
        });
      }
    })();
  }, 0);
}

// ============================================================
// SESSION TRANSITIONS
// ============================================================

function clearSession(): void {
  generationCounter += 1;

  activeIdentity = null;
  activeSession = null;
  activePurpose = null;

  validationRequests.clear();

  publish({
    status: "unauthenticated",
    purpose: null,
    identity: null,
    user: null,
    error: null,
  });
}

function handleAuthStateChange(
  event: string,
  session: Session | null,
  lifecycle: number,
): void {
  // ----------------------------------------------------------
  // 1. CHECK SUBSCRIPTION LIFECYCLE
  // ----------------------------------------------------------

  if (lifecycle !== lifecycleCounter) {
    return;
  }

  // ----------------------------------------------------------
  // 2. SIGN OUT
  // ----------------------------------------------------------

  if (event === "SIGNED_OUT") {
    clearSession();
    return;
  }

  // ----------------------------------------------------------
  // 3. EMPTY SESSION
  // ----------------------------------------------------------

  if (!session) {
    if (event === "INITIAL_SESSION") {
      clearSession();
    }

    return;
  }

  // ----------------------------------------------------------
  // 4. READ LOCAL SESSION CLAIMS
  // ----------------------------------------------------------

  const claims = readJwtClaims(session.access_token);

  const previousIdentity = activeIdentity;
  const previousSession = activeSession;

  const derivedSessionId = getSessionId(
    claims,
    previousIdentity,
    previousSession,
    session,
    event,
  );

  // ----------------------------------------------------------
  // 5. DETERMINE WHETHER THE SESSION IS THE SAME
  // ----------------------------------------------------------

  const sameSession =
    previousIdentity !== null &&
    derivedSessionId !== null &&
    previousIdentity.userId === session.user.id &&
    previousIdentity.sessionId === derivedSessionId;

  // ----------------------------------------------------------
  // 6. DETERMINE SESSION PURPOSE
  // ----------------------------------------------------------

  const purpose: SessionPurpose =
    event === "PASSWORD_RECOVERY" ||
    hasRecoveryAuthenticationMethod(claims) ||
    (
      sameSession &&
      activePurpose === "password_recovery"
    )
      ? "password_recovery"
      : "authenticated";

  // ----------------------------------------------------------
  // 7. CREATE OR REUSE SESSION IDENTITY
  // ----------------------------------------------------------

  const identity = createSessionIdentity(
    session,
    derivedSessionId,
    purpose,
  );

  const sameActiveIdentity =
    previousIdentity !== null &&
    sameSessionIdentity(
      previousIdentity,
      identity,
    );

  // ----------------------------------------------------------
  // 8. DETERMINE WHETHER UI CAN REMAIN AUTHENTICATED
  // ----------------------------------------------------------

  /**
   * Silent revalidation is permitted ONLY when all of these
   * conditions are satisfied:
   *
   * - The event is TOKEN_REFRESHED or SIGNED_IN.
   * - It belongs to the same exact session generation.
   * - The previous snapshot was fully authenticated.
   * - The previously verified user matches that identity.
   * - The authentication purpose remains normal authentication.
   *
   * This prevents an initial login, a replacement session,
   * a recovery session, or an account switch from inheriting
   * an old authenticated UI state.
   */
  const preserveAuthenticatedUiDuringRevalidation =
    (
      event === "TOKEN_REFRESHED" ||
      event === "SIGNED_IN"
    ) &&
    sameActiveIdentity &&
    purpose === "authenticated" &&
    activePurpose === "authenticated" &&
    snapshot.status === "authenticated" &&
    snapshot.purpose === "authenticated" &&
    sameSessionIdentity(snapshot.identity, identity) &&
    snapshot.user?.id === identity.userId;

  // ----------------------------------------------------------
  // 9. DISCARD PREVIOUS GENERATION VALIDATIONS
  // ----------------------------------------------------------

  /**
   * Requests from previous session identities must not
   * publish results for the newly accepted session.
   */
  if (!sameActiveIdentity) {
    validationRequests.clear();
  }

  // ----------------------------------------------------------
  // 10. UPDATE INTERNAL ACTIVE SESSION
  // ----------------------------------------------------------

  activeIdentity = identity;
  activeSession = session;
  activePurpose = purpose;

  // ----------------------------------------------------------
  // 11. PUBLISH OR PRESERVE UI STATE
  // ----------------------------------------------------------

  /**
   * Same-session TOKEN_REFRESHED and repeated SIGNED_IN events
   * do not publish a temporary validating snapshot when the
   * existing authenticated identity is still valid locally.
   *
   * The previously verified user and authenticated snapshot
   * remain available to the UI while the new token is checked.
   *
   * IMPORTANT:
   * validateSession() immediately registers a pending request.
   * isCurrentSession() and isCurrentAuthenticatedSession()
   * therefore remain false until that validation succeeds.
   */
  if (!preserveAuthenticatedUiDuringRevalidation) {
    publish({
      status: "validating",
      purpose,
      identity,
      user: null,
      error: null,
    });
  }

  // ----------------------------------------------------------
  // 12. VALIDATE THE CURRENT ACCESS TOKEN
  // ----------------------------------------------------------

  /**
   * Validation still runs for TOKEN_REFRESHED and repeated
   * SIGNED_IN events.
   *
   * Preserving the UI never means skipping Supabase
   * authentication verification.
   */
  validateSession(
    session,
    identity,
    purpose,
    lifecycle,
  );
}

// ============================================================
// COORDINATOR LIFECYCLE
// ============================================================

/**
 * Starts the central Supabase auth subscription.
 *
 * Reference counting prevents duplicate subscriptions when
 * React StrictMode repeats mount and cleanup cycles.
 *
 * When the final subscriber releases the coordinator:
 *
 * - The Supabase subscription is removed.
 * - Pending validations are invalidated.
 * - The active identity is cleared.
 * - The snapshot returns to initializing.
 */
export function startSessionCoordinator(): () => void {
  startCount += 1;

  if (startCount === 1) {
    const lifecycle = ++lifecycleCounter;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        handleAuthStateChange(
          event,
          session,
          lifecycle,
        );
      },
    );

    authSubscription = subscription;
  }

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;

    startCount = Math.max(
      0,
      startCount - 1,
    );

    if (startCount !== 0) {
      return;
    }

    // --------------------------------------------------------
    // 1. INVALIDATE ASYNCHRONOUS OPERATIONS
    // --------------------------------------------------------

    lifecycleCounter += 1;

    // --------------------------------------------------------
    // 2. STOP SUPABASE SUBSCRIPTION
    // --------------------------------------------------------

    authSubscription?.unsubscribe();
    authSubscription = null;

    // --------------------------------------------------------
    // 3. CLEAR PENDING VALIDATIONS
    // --------------------------------------------------------

    validationRequests.clear();

    // --------------------------------------------------------
    // 4. CLEAR ACTIVE SESSION
    // --------------------------------------------------------

    activeIdentity = null;
    activeSession = null;
    activePurpose = null;

    generationCounter += 1;

    // --------------------------------------------------------
    // 5. RESTORE INITIAL STATE
    // --------------------------------------------------------

    publish(INITIAL_SNAPSHOT);
  };
}

// ============================================================
// ACCESS TOKEN CORRELATION
// ============================================================

/**
 * Checks whether an access token belongs to the current
 * locally tracked Supabase session.
 *
 * This is a correlation helper, NOT JWT verification.
 *
 * It supports:
 *
 * - The exact active access token.
 * - A refreshed access token with the same session_id
 *   and user subject.
 *
 * During silent validation, this function may return true
 * for the new active token. It does NOT mean that the token
 * has passed verification.
 *
 * Authenticated operations must still use
 * isCurrentAuthenticatedSession() or wait for validation.
 */
export function isCurrentSessionAccessToken(
  accessToken: string,
): boolean {
  if (!accessToken || !activeSession) {
    return false;
  }

  const sessionCanOwnToken =
    snapshot.status === "validating" ||
    snapshot.status === "authenticated" ||
    snapshot.status === "password_recovery" ||
    snapshot.status === "error";

  if (!sessionCanOwnToken) {
    return false;
  }

  if (
    activeSession.access_token === accessToken
  ) {
    return true;
  }

  const candidateClaims = readJwtClaims(accessToken);

  const activeClaims = readJwtClaims(
    activeSession.access_token,
  );

  return (
    typeof candidateClaims?.session_id === "string" &&
    typeof activeClaims?.session_id === "string" &&
    candidateClaims.session_id ===
      activeClaims.session_id &&
    typeof candidateClaims.sub === "string" &&
    candidateClaims.sub === activeClaims.sub &&
    candidateClaims.sub === activeSession.user.id
  );
}

// ============================================================
// PASSWORD RECOVERY SESSION
// ============================================================

/**
 * Returns true only when the exact expected identity is
 * the currently verified password-recovery session.
 *
 * A pending validation prevents this helper from reporting
 * the recovery session as verified.
 */
export function isCurrentPasswordRecoverySession(
  expected: SessionIdentity | null | undefined,
): boolean {
  return Boolean(
    expected &&
      isCurrentSession(expected) &&
      snapshot.status === "password_recovery" &&
      snapshot.purpose === "password_recovery",
  );
}
