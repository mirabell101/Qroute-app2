
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
import type { QRouteRole } from "./lib/roles";
import { getStoredAccountDisplayName } from "./lib/accountApi";

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

  const [roleState, setRoleState] = useState<{
    userId: string | null;
    loaded: boolean;
    role: QRouteRole | null;
  }>({
    userId: null,
    loaded: false,
    role: null,
  });

  // A role is loading whenever the current user ID does not match
  // the ID associated with the completed role lookup.
  const roleLoading =
    currentUserId !== null &&
    (!roleState.loaded ||
      roleState.userId !== currentUserId);

  const currentUserRole =
    roleState.loaded &&
    roleState.userId === currentUserId
      ? roleState.role
      : null;

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
          setCurrentUserId(user.id);
          setIsGoogleUser(
            isGoogleAuthenticatedUser(user),
          );
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

        setCurrentUserId(
          session?.user.id ?? null,
        );

        setIsGoogleUser(
          isGoogleAuthenticatedUser(
            session?.user ?? null,
          ),
        );

        setDisplayNameStatus(
          session
            ? isGoogleAuthenticatedUser(session.user)
              ? "loading"
              : "not_required"
            : "not_required",
        );

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
   * Verify the stored Display Name for Google-authenticated users.
   *
   * Only the actual stored profiles.display_name is considered.
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
  }, [currentUserId, isGoogleUser]);

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
   * Central protected-page guard.
   *
   * Google accounts without a stored Display Name cannot enter
   * registered-user pages until the completion page is finished.
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
   * The Display Name page is protected by authentication and role.
   * It is intentionally exempt from the normal Display Name guard.
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
      />
    );
  };

  /**
   * Administrative pages require the database role.
   */
  const adminPage = (
    renderPage: (userId: string) => ReactNode,
  ): ReactNode => {
    if (authLoading || roleLoading) {
      return null;
    }

    if (!currentUserId) {
      return <Navigate to="/login" replace />;
    }

    if (currentUserRole !== "admin") {
      return <Navigate to="/home" replace />;
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
                element={protectedPage((userId) => (
                  <Home
                    currentUserId={userId}
                    onLogout={handleLogout}
                  />
                ))}
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
                ))}
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
