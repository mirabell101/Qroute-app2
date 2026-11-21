
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { supabase } from "./lib/supabase";
import {
  AUTH_ROLE_UPDATED_EVENT,
  getUserRole,
} from "./lib/authSession";
import { homeRedirectPath, type QRouteRole } from "./lib/roles";
import { getStoredAccountDisplayName } from "./lib/accountApi";
import { resolveVisitorMapRoute } from "./lib/visitorMapRoute";

import { SavedItemsProvider } from "./components/saved/SavedItemsContext";
import { RecentSearchesProvider } from "./components/recent-searches/RecentSearchesContext";
import { AccountProfileProvider } from "./components/account/AccountProfileContext";

import Landing from "./pages/visitor/Landing/Landing";
import Home from "./pages/registered-user/Home/Home";
import Login from "./pages/visitor/login/login";
import AuthCallback from "./pages/auth/callback";
import SignUp from "./pages/visitor/signup/signup";
import OTP from "./pages/visitor/OTP/OTP";
import Forgotpassword from "./pages/visitor/Forgotpassword/Forgotpassword";
import Resetpassword from "./pages/visitor/Resetpassword/Resetpassword";
import ResetOTP from "./pages/visitor/ResetOTP/ResetOTP";
import TermsAndConditions from "./pages/visitor/Legal/TermsAndCondition";
import PrivacyPolicy from "./pages/visitor/Legal/PrivacyPolicy";

import Profile from "./pages/registered-user/Profile/Profile";
import Contribution from "./pages/registered-user/contribution/contribution";
import Community from "./pages/registered-user/community/community";
import PointsBadges from "./pages/registered-user/points-badges/points-badges";
import Saved from "./pages/registered-user/saved/saved";
import RecentSearches from "./pages/registered-user/recent-searches/recent-searches";

import DisplayNameGAuth from "./pages/registered-user/display-name-gauth";

import AdminBase from "./pages/admin/base/base";
import Dashboard from "./pages/admin/dashboard/dashboard";
import RouteManagement from "./pages/admin/route-management/route-management";
import FareManagement from "./pages/admin/fare-management/fare-management";
import PostManagement from "./pages/admin/post-management/post-management";
import Reports from "./pages/admin/reports/reports";
import UserManagement from "./pages/admin/user-management/user-management";
import Notifications from "./pages/admin/notifications/notifications";
import Settings from "./pages/admin/settings/settings";

function hasRegisteredUserAccess(
  role: QRouteRole | null,
): boolean {
  return role === "registered_user" || role === "admin";
}

type DisplayNameStatus =
  | "not_required"
  | "loading"
  | "complete"
  | "missing"
  | "error";

function isGoogleAuthenticatedUser(
  user: {
    app_metadata?: Record<string, unknown>;
    identities?: Array<{ provider?: string }> | null;
  } | null,
): boolean {
  if (!user) return false;

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

function LoadingScreen() {
  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-sm text-gray-500">
        Loading...
      </p>
    </div>
  );
}

function DisplayNameVerificationError() {
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">
          Unable to verify your profile
        </h1>

        <p className="mt-3 text-sm text-gray-600">
          QRoute could not verify your stored Display Name.
          Please refresh the page or sign in again.
        </p>
      </div>
    </main>
  );
}

function App() {
  const [currentUserId, setCurrentUserId] =
    useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(true);

  const [isGoogleUser, setIsGoogleUser] = useState(false);

  const [displayNameStatus, setDisplayNameStatus] =
    useState<DisplayNameStatus>("not_required");

  // Allows the stored Display Name verification to be
  // explicitly refreshed without changing the user ID.
  const [displayNameRefreshVersion, setDisplayNameRefreshVersion] =
    useState(0);

  const [roleState, setRoleState] = useState<{
    userId: string | null;
    loaded: boolean;
    role: QRouteRole | null;
  }>({
    userId: null,
    loaded: false,
    role: null,
  });

  const roleLoading =
    currentUserId !== null &&
    (!roleState.loaded ||
      roleState.userId !== currentUserId);

  const currentUserRole =
    roleState.loaded &&
    roleState.userId === currentUserId
      ? roleState.role
      : null;

  const currentUserHomeRedirectPath = homeRedirectPath(currentUserRole);

  const authenticatedRootPath: string | null =
    authLoading || roleLoading
      ? null
      : currentUserId === null
        ? null
        : currentUserRole === "admin"
          ? "/admin/dashboard"
          : "/home";

  /**
   * Restore and verify the existing Supabase session.
   */
  useEffect(() => {
    let active = true;
    let validationInProgress = false;

    const validateSession = async () => {
      if (validationInProgress) return;

      validationInProgress = true;

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          console.error(
            "Could not restore Supabase session:",
            sessionError.message,
          );
        }

        if (sessionError || !session) {
          setCurrentUserId(null);
          setIsGoogleUser(false);
          setDisplayNameStatus("not_required");
          setAuthLoading(false);
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser(
          session.access_token,
        );

        if (!active) return;

        if (userError || !user) {
          console.warn(
            "Session is invalid or the account no longer exists.",
            userError?.message,
          );

          await supabase.auth.signOut({
            scope: "local",
          });

          if (!active) return;

          setCurrentUserId(null);
          setIsGoogleUser(false);
          setDisplayNameStatus("not_required");
        } else {
          const verifiedGoogleUser =
            isGoogleAuthenticatedUser(user);

          setCurrentUserId(user.id);
          setIsGoogleUser(verifiedGoogleUser);

          // Recheck the stored name on session validation,
          // even when the user ID has not changed.
          if (verifiedGoogleUser) {
            setDisplayNameStatus("loading");

            setDisplayNameRefreshVersion(
              (previous) => previous + 1,
            );
          } else {
            setDisplayNameStatus("not_required");
          }
        }

        setAuthLoading(false);
      } catch (error: unknown) {
        if (!active) return;

        console.error("Session validation failed:", error);

        setCurrentUserId(null);
        setIsGoogleUser(false);
        setDisplayNameStatus("not_required");
        setAuthLoading(false);
      } finally {
        validationInProgress = false;
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;

        if (event === "SIGNED_OUT") {
          setCurrentUserId(null);
          setIsGoogleUser(false);
          setDisplayNameStatus("not_required");
          setAuthLoading(false);

          setRoleState({
            userId: null,
            loaded: true,
            role: null,
          });

          return;
        }

        // INITIAL_SESSION is verified by validateSession().
        if (event === "INITIAL_SESSION") return;

        const authenticatedGoogleUser =
          isGoogleAuthenticatedUser(
            session?.user ?? null,
          );

        setCurrentUserId(
          session?.user.id ?? null,
        );

        setIsGoogleUser(authenticatedGoogleUser);

        setDisplayNameStatus(
          session
            ? authenticatedGoogleUser
              ? "loading"
              : "not_required"
            : "not_required",
        );

        if (session && authenticatedGoogleUser) {
          setDisplayNameRefreshVersion(
            (previous) => previous + 1,
          );
        }

        setAuthLoading(false);
      },
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void validateSession();
      }
    };

    void validateSession();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      active = false;
      subscription.unsubscribe();

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  /**
   * Load the role from the database.
   */
  useEffect(() => {
    let active = true;

    if (!currentUserId) {
      return () => {
        active = false;
      };
    }

    const loadRole = async () => {
      try {
        const role = await getUserRole(currentUserId);

        if (active) {
          setRoleState({
            userId: currentUserId,
            loaded: true,
            role,
          });
        }
      } catch (error: unknown) {
        console.error(
          "Could not load the user's role:",
          error,
        );

        if (active) {
          setRoleState({
            userId: currentUserId,
            loaded: true,
            role: null,
          });
        }
      }
    };

    void loadRole();

    const handleRoleUpdated = () => {
      setRoleState((previous) =>
        previous.userId === currentUserId
          ? {
              ...previous,
              loaded: false,
              role: null,
            }
          : previous,
      );

      void loadRole();
    };

    window.addEventListener(
      AUTH_ROLE_UPDATED_EVENT,
      handleRoleUpdated,
    );

    return () => {
      active = false;

      window.removeEventListener(
        AUTH_ROLE_UPDATED_EVENT,
        handleRoleUpdated,
      );
    };
  }, [currentUserId]);

  /**
   * Verify the actual stored Display Name for Google users.
   *
   * This never uses Google metadata as a substitute.
   */
  useEffect(() => {
    let active = true;

    if (!currentUserId) {
      setDisplayNameStatus("not_required");

      return () => {
        active = false;
      };
    }

    if (!isGoogleUser) {
      setDisplayNameStatus("not_required");

      return () => {
        active = false;
      };
    }

    setDisplayNameStatus("loading");

    const checkDisplayName = async () => {
      try {
        const storedDisplayName =
          await getStoredAccountDisplayName(
            currentUserId,
          );

        if (!active) return;

        setDisplayNameStatus(
          storedDisplayName
            ? "complete"
            : "missing",
        );
      } catch (error: unknown) {
        console.error(
          "Could not verify stored Display Name:",
          error,
        );

        if (active) {
          setDisplayNameStatus("error");
        }
      }
    };

    void checkDisplayName();

    return () => {
      active = false;
    };
  }, [
    currentUserId,
    isGoogleUser,
    displayNameRefreshVersion,
  ]);

  /**
   * Explicitly refresh the stored Display Name status.
   *
   * This can be called after the completion page successfully
   * saves the Display Name.
   */
  const refreshDisplayNameStatus = (): void => {
    if (!currentUserId || !isGoogleUser) {
      return;
    }

    setDisplayNameStatus("loading");

    setDisplayNameRefreshVersion(
      (previous) => previous + 1,
    );
  };

  /**
   * Sign out locally.
   */
  const handleLogout = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut({
      scope: "local",
    });

    if (error) {
      console.error("Logout failed:", error.message);
      throw error;
    }

    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");

    setCurrentUserId(null);
    setIsGoogleUser(false);
    setDisplayNameStatus("not_required");
  };

  /**
   * Central registered-user page guard.
   */
  const protectedPage = (
    renderPage: (userId: string) => ReactNode,
  ): ReactNode => {
    if (authLoading || roleLoading) {
      return null;
    }

    if (
      !currentUserId ||
      !hasRegisteredUserAccess(currentUserRole)
    ) {
      return <Navigate to="/login" replace />;
    }

    if (isGoogleUser) {
      if (displayNameStatus === "loading") {
        return null;
      }

      if (displayNameStatus === "error") {
        return <DisplayNameVerificationError />;
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

  /**
   * Display Name completion route.
   *
   * This route is exempt from the normal Display Name guard.
   */
  const displayNamePage = (): ReactNode => {
    if (authLoading || roleLoading) {
      return null;
    }

    if (
      !currentUserId ||
      !hasRegisteredUserAccess(currentUserRole)
    ) {
      return <Navigate to="/login" replace />;
    }

    if (!isGoogleUser) {
      return (
        <Navigate
          to={authenticatedRootPath ?? "/home"}
          replace
        />
      );
    }

    if (displayNameStatus === "loading") {
      return null;
    }

    if (displayNameStatus === "error") {
      return <DisplayNameVerificationError />;
    }

    if (displayNameStatus === "complete") {
      return (
        <Navigate
          to={authenticatedRootPath ?? "/home"}
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

  /**
   * Administrative page guard.
   *
   * Admins who authenticated through Google must also have
   * a verified stored Display Name before entering admin pages.
   */
  const adminPage = (
    renderPage: (userId: string) => ReactNode,
    allowedRoles: readonly QRouteRole[] = ["admin"],
  ): ReactNode => {
    if (authLoading || roleLoading) {
      return null;
    }

    if (!currentUserId) {
      return <Navigate to="/login" replace />;
    }

    if (!currentUserRole || !allowedRoles.includes(currentUserRole)) {
      return <Navigate to="/home" replace />;
    }

    if (isGoogleUser) {
      if (displayNameStatus === "loading") {
        return null;
      }

      if (displayNameStatus === "error") {
        return <DisplayNameVerificationError />;
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

  return (
    <BrowserRouter>
      <RecentSearchesProvider
        key={currentUserId ?? "anonymous"}
        userId={currentUserId}
      >
        <SavedItemsProvider
          key={currentUserId ?? "anonymous"}
          userId={currentUserId}
        >
          <AccountProfileProvider
            key={currentUserId ?? "anonymous"}
            userId={currentUserId}
          >
            <Routes>
              {/* Public routes */}

              <Route
                path="/"
                element={
                  window.location.hash.includes(
                    "access_token",
                  ) ||
                  window.location.search.includes("code=") ||
                  window.location.search.includes("error=") ? (
                    <Navigate
                      to={`/auth/callback${window.location.search}${window.location.hash}`}
                      replace
                    />
                  ) : authenticatedRootPath ? (
                    <Navigate
                      to={authenticatedRootPath}
                      replace
                    />
                  ) : authLoading || roleLoading ? (
                    null
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

              {/* Registered-user routes */}

              <Route
                path="/home"
                element={
                  resolveVisitorMapRoute({
                    authLoading,
                    roleLoading,
                    currentUserId,
                  }) === "loading"
                    ? null
                    : resolveVisitorMapRoute({
                        authLoading,
                        roleLoading,
                        currentUserId,
                      }) === "visitor"
                      ? (
                          <Landing
                            currentUserId={currentUserId}
                            onLogout={handleLogout}
                          />
                        )
                      : currentUserHomeRedirectPath ? (
                          <Navigate
                            to={currentUserHomeRedirectPath}
                            replace
                          />
                        )
                      : protectedPage((userId) => (
                          <Home
                            currentUserId={userId}
                            onLogout={handleLogout}
                          />
                        ))
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
                      key={currentUserId ?? "anonymous"}
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

              {/* Display Name completion */}

              <Route
                path="/register-user/display-name-gauth"
                element={displayNamePage()}
              />

              {/* Community intentionally supports visitors */}

              <Route
                path="/community"
                element={
                  <Community
                    currentUserId={currentUserId}
                    onLogout={handleLogout}
                  />
                }
              />

              {/* Authentication callback */}

              <Route
                path="/auth/callback"
                element={
                  <AuthCallback
                    authLoading={authLoading}
                    currentUserId={currentUserId}
                  />
                }
              />

              {/* Visitor routes */}

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

              {/* Admin routes */}

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
                element={adminPage(() => (
                  <RouteManagement />
                ), ["admin", "moderator"])}
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
                element={adminPage(() => <Notifications />)}
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

              {/* Unknown routes */}

              <Route
                path="*"
                element={<Navigate to="/" replace />}
              />
            </Routes>
          </AccountProfileProvider>
        </SavedItemsProvider>
      </RecentSearchesProvider>
    </BrowserRouter>
  );
}

export default App;
