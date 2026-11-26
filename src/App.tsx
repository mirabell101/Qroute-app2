import {
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import {
  AUTH_ROLE_UPDATED_EVENT,
  getUserRole,
} from "./lib/authSession";

import {
  getSessionSnapshot,
  isCurrentAuthenticatedSession,
  startSessionCoordinator,
  subscribeSessionState,
  type SessionIdentity,
} from "./lib/sessionCoordinator";

import { logoutCurrentDevice } from "./lib/authLogout";

import {
  homeRedirectPath,
  roleLandingPath,
  type QRouteRole,
} from "./lib/roles";

import { getStoredAccountDisplayName } from "./lib/accountApi";
import { resolveVisitorMapRoute } from "./lib/visitorMapRoute";

// ============================================================
// CONTEXT PROVIDERS
// ============================================================

import { AccountProfileProvider } from "./components/account/AccountProfileProvider";

import { SavedItemsProvider } from "./components/saved/SavedItemsContext";
import { RecentSearchesProvider } from "./components/recent-searches/RecentSearchesContext";

// ============================================================
// VISITOR PAGES
// ============================================================

import Landing from "./pages/visitor/Landing/Landing";
import Login from "./pages/visitor/login/login";
import SignUp from "./pages/visitor/signup/signup";
import OTP from "./pages/visitor/OTP/OTP";
import Forgotpassword from "./pages/visitor/Forgotpassword/Forgotpassword";
import Resetpassword from "./pages/visitor/Resetpassword/Resetpassword";
import ResetOTP from "./pages/visitor/ResetOTP/ResetOTP";

import TermsAndConditions from "./pages/visitor/Legal/TermsAndCondition";
import PrivacyPolicy from "./pages/visitor/Legal/PrivacyPolicy";

// ============================================================
// PUBLIC PHOTO GALLERY
// ============================================================

import PhotoGalleryPage from "./pages/PhotoGalleryPage";

// ============================================================
// AUTHENTICATION PAGES
// ============================================================

import AuthCallback from "./pages/auth/callback";

// ============================================================
// REGISTERED-USER PAGES
// ============================================================

import Home from "./pages/registered-user/Home/Home";
import Profile from "./pages/registered-user/Profile/Profile";
import Contribution from "./pages/registered-user/contribution/contribution";
import Community from "./pages/registered-user/community/community";
import PointsBadges from "./pages/registered-user/points-badges/points-badges";
import Saved from "./pages/registered-user/saved/saved";
import RecentSearches from "./pages/registered-user/recent-searches/recent-searches";

import DisplayNameGAuth from "./pages/registered-user/display-name-gauth";

// ============================================================
// ADMIN PAGES
// ============================================================

import AdminBase from "./pages/admin/base/base";
import Dashboard from "./pages/admin/dashboard/dashboard";
import RouteManagement from "./pages/admin/route-management/route-management";
import FareManagement from "./pages/admin/fare-management/fare-management";
import PostManagement from "./pages/admin/post-management/post-management";
import Reports from "./pages/admin/reports/reports";
import UserManagement from "./pages/admin/user-management/user-management";
import Notifications from "./pages/admin/notifications/notifications";
import Settings from "./pages/admin/settings/settings";

// ============================================================
// IMPORTANT ROUTER OWNERSHIP
// ============================================================

/**
 * BrowserRouter is mounted once in main.tsx.
 *
 * App must NOT create another BrowserRouter.
 *
 * This component consumes the existing Router context
 * through Routes, Route and Navigate.
 */

// ============================================================
// ACCESS HELPERS
// ============================================================

function hasRegisteredUserAccess(
  role: QRouteRole | null,
): boolean {
  return (
    role === "registered_user" ||
    role === "admin"
  );
}

// ============================================================
// TYPES
// ============================================================

type DisplayNameStatus =
  | "not_required"
  | "loading"
  | "complete"
  | "missing"
  | "error";

interface RoleState {
  userId: string | null;
  generation: number | null;
  loaded: boolean;
  role: QRouteRole | null;
}

interface DisplayNameState {
  userId: string | null;
  generation: number | null;
  status: DisplayNameStatus;
}

interface GoogleProviderState {
  userId: string;
  generation: number;
  sessionId: string;
  isGoogleUser: boolean;
}

// ============================================================
// GOOGLE PROVIDER DETECTION
// ============================================================

function isGoogleAuthenticatedUser(
  user: {
    app_metadata?: Record<string, unknown>;
    identities?: Array<{ provider?: string }> | null;
  } | null,
): boolean {
  if (!user) {
    return false;
  }

  const appProvider = user.app_metadata?.provider;

  if (appProvider === "google") {
    return true;
  }

  const providers = user.app_metadata?.providers;

  if (
    Array.isArray(providers) &&
    providers.includes("google")
  ) {
    return true;
  }

  return (
    user.identities?.some(
      (identity) => identity.provider === "google",
    ) ?? false
  );
}

// ============================================================
// SESSION IDENTITY COMPARISON
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

/**
 * Allows a profile-verification result to remain associated
 * with the same identity while its access token is refreshing.
 *
 * This is NOT an authentication or route authorization check.
 *
 * Protected routes still require a fully authenticated session.
 */
function isCurrentTrackedSession(
  expectedIdentity: SessionIdentity,
): boolean {
  const current = getSessionSnapshot();

  return (
    sameSessionIdentity(
      current.identity,
      expectedIdentity,
    ) &&
    current.purpose === "authenticated" &&
    (
      current.status === "authenticated" ||
      current.status === "validating"
    )
  );
}

// ============================================================
// DEDUPLICATED DISPLAY NAME REQUESTS
// ============================================================

/**
 * Only pending Display Name requests are cached.
 *
 * This prevents duplicate requests during React StrictMode
 * effect setup/cleanup cycles.
 *
 * Completed requests are removed. Their results are retained
 * separately in the component's session-generation state.
 */
const pendingDisplayNameChecks =
  new Map<string, Promise<string | null>>();

function getStoredAccountDisplayNameOnce(
  userId: string,
  generation: number,
  refreshVersion: number,
): Promise<string | null> {
  const requestKey = JSON.stringify([
    userId,
    generation,
    refreshVersion,
  ]);

  const existingRequest =
    pendingDisplayNameChecks.get(requestKey);

  if (existingRequest) {
    return existingRequest;
  }

  const request = getStoredAccountDisplayName(userId);

  pendingDisplayNameChecks.set(
    requestKey,
    request,
  );

  const clearPendingRequest = (): void => {
    if (
      pendingDisplayNameChecks.get(requestKey) ===
      request
    ) {
      pendingDisplayNameChecks.delete(requestKey);
    }
  };

  void request.then(
    clearPendingRequest,
    clearPendingRequest,
  );

  return request;
}

// ============================================================
// OAUTH CALLBACK DETECTION
// ============================================================

/**
 * Detects OAuth callback parameters in either the query
 * string or URL fragment.
 */
function hasOAuthCallbackPayload(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const queryParams = new URLSearchParams(
    window.location.search,
  );

  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );

  const callbackParameters = [
    "code",
    "access_token",
    "refresh_token",
    "error",
    "error_description",
  ];

  return callbackParameters.some(
    (parameter) =>
      queryParams.has(parameter) ||
      hashParams.has(parameter),
  );
}

// ============================================================
// SHARED UI
// ============================================================

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center">
      <p
        role="status"
        className="text-sm text-gray-500"
      >
        Loading...
      </p>
    </div>
  );
}

function DisplayNameVerificationError({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">
          Unable to verify your profile
        </h1>

        <p className="mt-3 text-sm text-gray-600">
          QRoute temporarily could not verify your stored
          Display Name. Your authentication session has not
          necessarily expired. Please try the verification again.
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-md bg-[#6355F5] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#5547E8]"
        >
          Retry verification
        </button>
      </div>
    </main>
  );
}

function RoleVerificationError() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">
          Unable to verify your account permissions
        </h1>

        <p className="mt-3 text-sm text-gray-600">
          Your authentication succeeded, but QRoute could not
          retrieve a valid account role. Please refresh the page
          or contact an administrator.
        </p>
      </div>
    </main>
  );
}

// ============================================================
// APP
// ============================================================

function App() {
  // ==========================================================
  // 1. CENTRAL SESSION COORDINATOR
  // ==========================================================

  const sessionSnapshot = useSyncExternalStore(
    subscribeSessionState,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  /**
   * The coordinator owns the only central Supabase
   * authentication-state subscription.
   */
  useEffect(() => {
    return startSessionCoordinator();
  }, []);

  const authLoading =
    sessionSnapshot.status === "initializing" ||
    sessionSnapshot.status === "validating";

  /**
   * Preserve the identity during a normal token refresh.
   *
   * The coordinator keeps the same identity generation while
   * it validates a refreshed token for the existing session.
   *
   * This identity is used for state correlation only.
   * Protected routes still require status === authenticated.
   */
  const coordinatorSessionIdentity =
    sessionSnapshot.purpose === "authenticated" &&
    (
      sessionSnapshot.status === "authenticated" ||
      sessionSnapshot.status === "validating"
    )
      ? sessionSnapshot.identity
      : null;

  /**
   * Only a fully validated normal authenticated session
   * may enter protected application routes.
   */
  const authenticatedIdentity =
    sessionSnapshot.status === "authenticated" &&
    sessionSnapshot.purpose === "authenticated"
      ? sessionSnapshot.identity
      : null;

  const currentUserId =
    coordinatorSessionIdentity?.userId ?? null;

  const currentSessionGeneration =
    coordinatorSessionIdentity?.generation ?? null;

  /**
   * This key remains useful for the individual RecentSearches
   * page, but must NOT be used to remount the global providers.
   */
  const sessionProviderKey =
    currentUserId &&
    currentSessionGeneration !== null
      ? `${currentUserId}:${currentSessionGeneration}`
      : "anonymous";

  // ==========================================================
  // 2. GOOGLE PROVIDER STATE
  // ==========================================================

  const [googleProviderState, setGoogleProviderState] =
    useState<GoogleProviderState | null>(null);

  /**
   * Save the provider classification only after the coordinator
   * has validated the authenticated session.
   *
   * During TOKEN_REFRESHED, the coordinator temporarily sets
   * snapshot.user to null. We deliberately do not erase the
   * previously established Google-provider classification.
   */
  useEffect(() => {
    const identity = authenticatedIdentity;
    const user = sessionSnapshot.user;

    if (!identity || !user) {
      return;
    }

    const detectedGoogleUser =
      isGoogleAuthenticatedUser(user);

    setGoogleProviderState((previous) => {
      if (
        previous?.userId === identity.userId &&
        previous.generation === identity.generation &&
        previous.sessionId === identity.sessionId &&
        previous.isGoogleUser === detectedGoogleUser
      ) {
        return previous;
      }

      return {
        userId: identity.userId,
        generation: identity.generation,
        sessionId: identity.sessionId,
        isGoogleUser: detectedGoogleUser,
      };
    });
  }, [
    authenticatedIdentity?.userId,
    authenticatedIdentity?.generation,
    authenticatedIdentity?.sessionId,
    sessionSnapshot.user,
  ]);

  const googleProviderStateMatchesCurrentSession =
    coordinatorSessionIdentity !== null &&
    googleProviderState !== null &&
    googleProviderState.userId ===
      coordinatorSessionIdentity.userId &&
    googleProviderState.generation ===
      coordinatorSessionIdentity.generation &&
    googleProviderState.sessionId ===
      coordinatorSessionIdentity.sessionId;

  /**
   * Use the cached provider classification while the same
   * identity is temporarily validating.
   *
   * Never carry the classification across generations.
   */
  const isGoogleUser =
    googleProviderStateMatchesCurrentSession
      ? googleProviderState.isGoogleUser
      : authenticatedIdentity !== null &&
        isGoogleAuthenticatedUser(sessionSnapshot.user);

  // ==========================================================
  // 3. ROLE STATE
  // ==========================================================

  const [roleState, setRoleState] =
    useState<RoleState>({
      userId: null,
      generation: null,
      loaded: false,
      role: null,
    });

  const roleStateMatchesCurrentSession =
    authenticatedIdentity !== null &&
    roleState.userId === authenticatedIdentity.userId &&
    roleState.generation ===
      authenticatedIdentity.generation;

  const roleLoading =
    authenticatedIdentity !== null &&
    (
      !roleStateMatchesCurrentSession ||
      !roleState.loaded
    );

  const currentUserRole =
    roleStateMatchesCurrentSession &&
    roleState.loaded
      ? roleState.role
      : null;

  /**
   * Do not calculate a landing path without a verified role.
   */
  const currentUserHomeRedirectPath =
    currentUserRole
      ? homeRedirectPath(currentUserRole)
      : null;

  const authenticatedRootPath: string | null =
    !authenticatedIdentity ||
    roleLoading ||
    !currentUserRole
      ? null
      : roleLandingPath(currentUserRole);

  // ==========================================================
  // 4. ROLE LOADING
  // ==========================================================

  useEffect(() => {
    const identity = authenticatedIdentity;

    if (!identity) {
      return;
    }

    let active = true;
    let requestVersion = 0;

    const loadRole = async (): Promise<void> => {
      const requestId = ++requestVersion;

      try {
        const role = await getUserRole(
          identity.userId,
          identity,
        );

        if (
          !active ||
          requestId !== requestVersion ||
          !isCurrentAuthenticatedSession(identity)
        ) {
          return;
        }

        setRoleState({
          userId: identity.userId,
          generation: identity.generation,
          loaded: true,
          role,
        });
      } catch (error: unknown) {
        if (
          !active ||
          requestId !== requestVersion ||
          !isCurrentAuthenticatedSession(identity)
        ) {
          return;
        }

        console.error(
          "Could not load the user's role:",
          error,
        );

        setRoleState({
          userId: identity.userId,
          generation: identity.generation,
          loaded: true,
          role: null,
        });
      }
    };

    const handleRoleUpdated = (): void => {
      setRoleState((previous) => {
        if (
          previous.userId !== identity.userId ||
          previous.generation !== identity.generation
        ) {
          return previous;
        }

        return {
          ...previous,
          loaded: false,
          role: null,
        };
      });

      void loadRole();
    };

    void loadRole();

    window.addEventListener(
      AUTH_ROLE_UPDATED_EVENT,
      handleRoleUpdated,
    );

    return () => {
      active = false;
      requestVersion += 1;

      window.removeEventListener(
        AUTH_ROLE_UPDATED_EVENT,
        handleRoleUpdated,
      );
    };
  }, [
    authenticatedIdentity?.userId,
    authenticatedIdentity?.generation,
  ]);

  // ==========================================================
  // 5. GOOGLE DISPLAY NAME STATE
  // ==========================================================

  const [displayNameState, setDisplayNameState] =
    useState<DisplayNameState>({
      userId: null,
      generation: null,
      status: "not_required",
    });

  /**
   * This version changes only when the user explicitly
   * requests another verification attempt.
   *
   * Tab switching and token refreshes do not increment it.
   */
  const [
    displayNameRefreshVersion,
    setDisplayNameRefreshVersion,
  ] = useState(0);

  const displayNameStateMatchesCurrentSession =
    coordinatorSessionIdentity !== null &&
    displayNameState.userId ===
      coordinatorSessionIdentity.userId &&
    displayNameState.generation ===
      coordinatorSessionIdentity.generation;

  const displayNameStatus: DisplayNameStatus =
    !isGoogleUser
      ? "not_required"
      : displayNameStateMatchesCurrentSession
        ? displayNameState.status
        : "loading";

  /**
   * Verify the actual stored Display Name for Google users.
   *
   * Important behavior:
   *
   * - The effect uses the stable coordinator identity.
   * - A token refresh does not change its dependencies.
   * - Existing verification state is not cleared during
   *   temporary validation.
   * - Successful and missing results are retained for the
   *   exact session generation.
   * - Errors remain recoverable through an explicit retry.
   */
  useEffect(() => {
    const identity = coordinatorSessionIdentity;

    if (!identity || !isGoogleUser) {
      return;
    }

    /**
     * Start a new lookup only after the coordinator has
     * published a fully authenticated session.
     */
    const initialSnapshot = getSessionSnapshot();

    if (
      initialSnapshot.status !== "authenticated" ||
      initialSnapshot.purpose !== "authenticated" ||
      !sameSessionIdentity(
        initialSnapshot.identity,
        identity,
      )
    ) {
      return;
    }

    let active = true;

    const belongsToSameTrackedSession = (): boolean =>
      active && isCurrentTrackedSession(identity);

    setDisplayNameState({
      userId: identity.userId,
      generation: identity.generation,
      status: "loading",
    });

    const checkDisplayName = async (): Promise<void> => {
      try {
        const storedDisplayName =
          await getStoredAccountDisplayNameOnce(
            identity.userId,
            identity.generation,
            displayNameRefreshVersion,
          );

        /**
         * Accept the result during a same-generation token
         * refresh. Do not confuse temporary validation with
         * an account or session change.
         */
        if (!belongsToSameTrackedSession()) {
          return;
        }

        const hasDisplayName =
          typeof storedDisplayName === "string" &&
          storedDisplayName.trim().length > 0;

        setDisplayNameState({
          userId: identity.userId,
          generation: identity.generation,
          status: hasDisplayName
            ? "complete"
            : "missing",
        });
      } catch (error: unknown) {
        if (!belongsToSameTrackedSession()) {
          return;
        }

        console.error(
          "Could not verify stored Display Name:",
          error,
        );

        setDisplayNameState({
          userId: identity.userId,
          generation: identity.generation,
          status: "error",
        });
      }
    };

    void checkDisplayName();

    return () => {
      active = false;
    };
  }, [
    coordinatorSessionIdentity?.userId,
    coordinatorSessionIdentity?.generation,
    coordinatorSessionIdentity?.sessionId,
    isGoogleUser,
    displayNameRefreshVersion,
  ]);

  // ==========================================================
  // 6. RETRY DISPLAY NAME VERIFICATION
  // ==========================================================

  /**
   * Only an explicitly authenticated Google session can
   * initiate a new Display Name verification request.
   */
  const refreshDisplayNameStatus = (): void => {
    const identity = authenticatedIdentity;

    if (
      !identity ||
      !isGoogleUser ||
      !isCurrentAuthenticatedSession(identity)
    ) {
      return;
    }

    setDisplayNameState({
      userId: identity.userId,
      generation: identity.generation,
      status: "loading",
    });

    setDisplayNameRefreshVersion(
      (previous) => previous + 1,
    );
  };

  // ==========================================================
  // 7. LOCAL LOGOUT
  // ==========================================================

  const handleLogout = async (): Promise<void> => {
    try {
      await logoutCurrentDevice();
    } catch (error: unknown) {
      console.error(
        "Logout failed:",
        error instanceof Error
          ? error.message
          : error,
      );

      throw error;
    }
  };

  // ==========================================================
  // 8. REGISTERED-USER PAGE GUARD
  // ==========================================================

  const protectedPage = (
    renderPage: (userId: string) => ReactNode,
  ): ReactNode => {
    if (authLoading || roleLoading) {
      return <LoadingScreen />;
    }

    if (!authenticatedIdentity || !currentUserId) {
      return <Navigate to="/login" replace />;
    }

    if (!currentUserRole) {
      return <RoleVerificationError />;
    }

    if (!hasRegisteredUserAccess(currentUserRole)) {
      return (
        <Navigate
          to={roleLandingPath(currentUserRole)}
          replace
        />
      );
    }

    if (isGoogleUser) {
      if (displayNameStatus === "loading") {
        return <LoadingScreen />;
      }

      if (displayNameStatus === "error") {
        return (
          <DisplayNameVerificationError
            onRetry={refreshDisplayNameStatus}
          />
        );
      }

      if (displayNameStatus === "missing") {
        return (
          <Navigate
            to="/register-user/display-name-gauth"
            replace
          />
        );
      }
    }

    return renderPage(currentUserId);
  };

  // ==========================================================
  // 9. GOOGLE DISPLAY NAME COMPLETION GUARD
  // ==========================================================

  const displayNamePage = (): ReactNode => {
    if (authLoading || roleLoading) {
      return <LoadingScreen />;
    }

    if (!authenticatedIdentity || !currentUserId) {
      return <Navigate to="/login" replace />;
    }

    if (!currentUserRole) {
      return <RoleVerificationError />;
    }

    if (!hasRegisteredUserAccess(currentUserRole)) {
      return (
        <Navigate
          to={roleLandingPath(currentUserRole)}
          replace
        />
      );
    }

    if (!isGoogleUser) {
      return (
        <Navigate
          to={
            authenticatedRootPath ??
            roleLandingPath(currentUserRole)
          }
          replace
        />
      );
    }

    if (displayNameStatus === "loading") {
      return <LoadingScreen />;
    }

    if (displayNameStatus === "error") {
      return (
        <DisplayNameVerificationError
          onRetry={refreshDisplayNameStatus}
        />
      );
    }

    if (displayNameStatus === "complete") {
      return (
        <Navigate
          to={
            authenticatedRootPath ??
            roleLandingPath(currentUserRole)
          }
          replace
        />
      );
    }

    return (
      <DisplayNameGAuth
        userId={currentUserId}
        onComplete={refreshDisplayNameStatus}
      />
    );
  };

  // ==========================================================
  // 10. ADMIN PAGE GUARD
  // ==========================================================

  /**
   * Admins who authenticated through Google must also have
   * a verified stored Display Name before entering admin pages.
   */
  const adminPage = (
    renderPage: (userId: string) => ReactNode,
    allowedRoles: readonly QRouteRole[] = ["admin"],
  ): ReactNode => {
    if (authLoading || roleLoading) {
      return <LoadingScreen />;
    }

    if (!authenticatedIdentity || !currentUserId) {
      return <Navigate to="/login" replace />;
    }

    if (!currentUserRole) {
      return <RoleVerificationError />;
    }

    if (!allowedRoles.includes(currentUserRole)) {
      return (
        <Navigate
          to={roleLandingPath(currentUserRole)}
          replace
        />
      );
    }

    if (isGoogleUser) {
      if (displayNameStatus === "loading") {
        return <LoadingScreen />;
      }

      if (displayNameStatus === "error") {
        return (
          <DisplayNameVerificationError
            onRetry={refreshDisplayNameStatus}
          />
        );
      }

      if (displayNameStatus === "missing") {
        return (
          <Navigate
            to="/register-user/display-name-gauth"
            replace
          />
        );
      }
    }

    return renderPage(currentUserId);
  };

  // ==========================================================
  // 11. VISITOR MAP ROUTE STATE
  // ==========================================================

  const homeRouteMode = resolveVisitorMapRoute({
    authLoading,
    roleLoading,
    currentUserId,
  });

  // ==========================================================
  // 12. OAUTH CALLBACK URL STATE
  // ==========================================================

  const oauthCallbackPending =
    hasOAuthCallbackPayload();

  // ==========================================================
  // 13. ROUTES AND PROVIDERS
  // ==========================================================

  /**
   * BrowserRouter is provided by main.tsx.
   *
   * Global providers remain mounted across authentication
   * changes. Identity-specific state is managed internally
   * by each provider.
   */

  return (
    <AccountProfileProvider
      userId={currentUserId}
      sessionGeneration={currentSessionGeneration}
    >
      <RecentSearchesProvider
        userId={currentUserId}
      >
        <SavedItemsProvider
          userId={currentUserId}
          sessionGeneration={currentSessionGeneration}
        >
          <Routes>
            {/* =================================================
                PUBLIC ROUTES
            ================================================== */}

            {/*
              Public location photo gallery.
              This route intentionally does not use protectedPage,
              adminPage, or any authentication redirect.
            */}
            <Route
              path="/photos/:kind/:id"
              element={<PhotoGalleryPage />}
            />

            <Route
              path="/"
              element={
                oauthCallbackPending ? (
                  <Navigate
                    to={`/auth/callback${window.location.search}${window.location.hash}`}
                    replace
                  />
                ) : authLoading || roleLoading ? (
                  <LoadingScreen />
                ) : authenticatedIdentity ? (
                  currentUserRole ? (
                    <Navigate
                      to={roleLandingPath(currentUserRole)}
                      replace
                    />
                  ) : (
                    <RoleVerificationError />
                  )
                ) : (
                  <Landing
                    currentUserId={currentUserId}
                    onLogout={handleLogout}
                  />
                )
              }
            />

            <Route
              path="/base"
              element={
                <Landing
                  currentUserId={currentUserId}
                  onLogout={handleLogout}
                />
              }
            />

            {/* =================================================
                REGISTERED-USER ROUTES
            ================================================== */}

            <Route
              path="/home"
              element={
                homeRouteMode === "loading" ? (
                  <LoadingScreen />
                ) : homeRouteMode === "visitor" ? (
                  <Landing
                    currentUserId={currentUserId}
                    onLogout={handleLogout}
                  />
                ) : !authenticatedIdentity ? (
                  <Navigate to="/login" replace />
                ) : !currentUserRole ? (
                  roleLoading ? (
                    <LoadingScreen />
                  ) : (
                    <RoleVerificationError />
                  )
                ) : currentUserHomeRedirectPath ? (
                  <Navigate
                    to={currentUserHomeRedirectPath}
                    replace
                  />
                ) : (
                  protectedPage((userId) => (
                    <Home
                      currentUserId={userId}
                      onLogout={handleLogout}
                    />
                  ))
                )
              }
            />

            <Route
              path="/saved"
              element={protectedPage((userId) => (
                <Saved
                  currentUserId={userId}
                  onLogout={handleLogout}
                />
              ))}
            />

            <Route
              path="/recents"
              element={
                authLoading ? (
                  <LoadingScreen />
                ) : (
                  <RecentSearches
                    key={sessionProviderKey}
                    currentUserId={currentUserId}
                    onLogout={handleLogout}
                  />
                )
              }
            />

            <Route
              path="/contribution"
              element={protectedPage((userId) => (
                <Contribution
                  currentUserId={userId}
                  onLogout={handleLogout}
                />
              ))}
            />

            <Route
              path="/profile"
              element={protectedPage((userId) => (
                <Profile
                  currentUserId={userId}
                  onLogout={handleLogout}
                />
              ))}
            />

            <Route
              path="/points-badges"
              element={protectedPage(() => (
                <PointsBadges />
              ))}
            />

            {/* =================================================
                GOOGLE DISPLAY NAME COMPLETION
            ================================================== */}

            <Route
              path="/register-user/display-name-gauth"
              element={displayNamePage()}
            />

            {/* =================================================
                COMMUNITY
                Visitors may view the community.
            ================================================== */}

            <Route
              path="/community"
              element={
                <Community
                  currentUserId={currentUserId}
                  onLogout={handleLogout}
                />
              }
            />

            {/* =================================================
                AUTHENTICATION CALLBACK
            ================================================== */}

            <Route
              path="/auth/callback"
              element={
                <AuthCallback
                  authLoading={authLoading}
                  currentUserId={currentUserId}
                />
              }
            />

            {/* =================================================
                VISITOR AUTHENTICATION ROUTES
            ================================================== */}

            <Route
              path="/login"
              element={<Login />}
            />

            <Route
              path="/signup"
              element={<SignUp />}
            />

            <Route
              path="/otp"
              element={<OTP />}
            />

            <Route
              path="/forgot-password"
              element={<Forgotpassword />}
            />

            <Route
              path="/resetpassword"
              element={<Resetpassword />}
            />

            <Route
              path="/reset-password"
              element={<Resetpassword />}
            />

            <Route
              path="/reset-otp"
              element={<ResetOTP />}
            />

            <Route
              path="/terms-and-condition"
              element={<TermsAndConditions />}
            />

            <Route
              path="/privacy-policy"
              element={<PrivacyPolicy />}
            />

            {/* =================================================
                ADMIN ROUTES
            ================================================== */}

            <Route
              path="/admin"
              element={adminPage(() => (
                <Navigate
                  to="/admin/dashboard"
                  replace
                />
              ))}
            />

            <Route
              path="/admin/fare-management"
              element={adminPage(() => (
                <FareManagement />
              ))}
            />

            <Route
              path="/admin/base"
              element={adminPage((userId) => (
                <AdminBase
                  currentUserId={userId}
                  onLogout={handleLogout}
                />
              ))}
            />

            <Route
              path="/admin/dashboard"
              element={adminPage(() => (
                <Dashboard />
              ))}
            />

            <Route
              path="/admin/routes"
              element={adminPage(
                () => <RouteManagement />,
                ["admin", "moderator"],
              )}
            />

            <Route
              path="/admin/post-management"
              element={adminPage(() => (
                <PostManagement />
              ))}
            />

            <Route
              path="/admin/reports"
              element={adminPage(() => (
                <Reports />
              ))}
            />

            <Route
              path="/admin/notifications"
              element={adminPage(() => (
                <Notifications />
              ))}
            />

            <Route
              path="/admin/users"
              element={adminPage(() => (
                <UserManagement />
              ))}
            />

            <Route
              path="/admin/settings"
              element={adminPage(() => (
                <Settings />
              ))}
            />

            {/* =================================================
                UNKNOWN ROUTES
            ================================================== */}

            <Route
              path="*"
              element={<Navigate to="/" replace />}
            />
          </Routes>
        </SavedItemsProvider>
      </RecentSearchesProvider>
    </AccountProfileProvider>
  );
}

export default App;
