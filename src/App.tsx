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
import { resolveAuthenticatedRootPath } from "./lib/authRedirect";
import type { QRouteRole } from "./lib/roles";
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
import AdminBase from "./pages/admin/base/base";
import Dashboard from "./pages/admin/dashboard/dashboard";
import RouteManagement from "./pages/admin/route-management/route-management";
import PostManagement from "./pages/admin/post-management/post-management";
import Reports from "./pages/admin/reports/reports";
import UserManagement from "./pages/admin/user-management/user-management";

function hasRegisteredUserAccess(role: QRouteRole | null): boolean {
  return role === "registered_user" || role === "admin";
}

function App() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleState, setRoleState] = useState<{
    userId: string | null;
    loaded: boolean;
    role: QRouteRole | null;
  }>({
    userId: null,
    loaded: false,
    role: null,
  });

  // A role is "loading" as soon as a user ID exists but no role load has
  // finished for that same user. Deriving this during render (instead of
  // setting loading state inside the effect) prevents a protected route from
  // briefly redirecting while the effect has not run yet.
  const roleLoading =
    currentUserId !== null &&
    (!roleState.loaded || roleState.userId !== currentUserId);

  const currentUserRole =
    roleState.loaded && roleState.userId === currentUserId
      ? roleState.role
      : null;
  const authenticatedRootPath = resolveAuthenticatedRootPath(
    currentUserId !== null
  );

  // Restore and validate the existing Supabase session.
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
            sessionError.message
          );
        }

        if (sessionError || !session) {
          setCurrentUserId(null);
          setAuthLoading(false);
          return;
        }

        // Ask Supabase Auth to verify the current user.
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser(session.access_token);

        if (!active) return;

        if (userError || !user) {
          console.warn(
            "Session is invalid or the account no longer exists.",
            userError?.message
          );

          await supabase.auth.signOut({ scope: "local" });

          if (!active) return;

          setCurrentUserId(null);
        } else {
          setCurrentUserId(user.id);
        }

        setAuthLoading(false);
      } catch (error) {
        if (!active) return;

        console.error("Session validation failed:", error);
        setCurrentUserId(null);
        setAuthLoading(false);
      } finally {
        validationInProgress = false;
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT") {
        setCurrentUserId(null);
        setAuthLoading(false);
        setRoleState({ userId: null, loaded: true, role: null });
        return;
      }

      // Initial sessions are verified by validateSession().
      if (event === "INITIAL_SESSION") return;

      setCurrentUserId(session?.user.id ?? null);
      setAuthLoading(false);
    });

    // Validate on startup and when the user returns to this tab.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void validateSession();
      }
    };

    void validateSession();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      active = false;
      subscription.unsubscribe();

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, []);

  // Load the role from the database for both Google and password sessions.
  // Frontend state is only a cache of the database value and never decides
  // authorization by itself.
  useEffect(() => {
    let active = true;
    let requestId = 0;

    if (!currentUserId) {
      return () => {
        active = false;
      };
    }

    const loadRole = async () => {
      const currentRequest = ++requestId;

      try {
        const role = await getUserRole(currentUserId);

        if (active && currentRequest === requestId) {
          setRoleState({
            userId: currentUserId,
            loaded: true,
            role,
          });
        }
      } catch (error) {
        console.error("Could not load the user's role:", error);

        if (active && currentRequest === requestId) {
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
      // A new account may receive its role after the first read. Mark the
      // current role as loading so protected routes wait instead of redirecting.
      setRoleState((previous) =>
        previous.userId === currentUserId
          ? { ...previous, loaded: false, role: null }
          : previous
      );

      void loadRole();
    };

    window.addEventListener(AUTH_ROLE_UPDATED_EVENT, handleRoleUpdated);

    return () => {
      active = false;
      window.removeEventListener(AUTH_ROLE_UPDATED_EVENT, handleRoleUpdated);
    };
  }, [currentUserId]);

  // Sign out on this device/browser only.
  const handleLogout = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut({
      scope: "local",
    });

    if (error) {
      console.error("Logout failed:", error.message);
      throw error;
    }

    // Clean up values left by the old local-storage login system.
    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");

    // The auth listener also updates this state.
    setCurrentUserId(null);
  };

  // Render protected pages only after checking the session.
  // The callback receives a non-null user ID.
  const protectedPage = (
    renderPage: (userId: string) => ReactNode
  ): ReactNode => {
    if (authLoading || roleLoading) {
      return null;
    }

    if (!currentUserId || !hasRegisteredUserAccess(currentUserRole)) {
      return <Navigate to="/login" replace />;
    }

    return renderPage(currentUserId);
  };

  // Administrative pages require the database role. Authentication alone is
  // not enough, and the same rule applies to Google and password sessions.
  const adminPage = (renderPage: () => ReactNode): ReactNode => {
    if (authLoading || roleLoading) {
      return null;
    }

    if (!currentUserId) {
      return <Navigate to="/login" replace />;
    }

    if (currentUserRole !== "admin") {
      return <Navigate to="/home" replace />;
    }

    return renderPage();
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
                  authLoading ? null : authenticatedRootPath ? (
                    <Navigate to={authenticatedRootPath} replace />
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
                element={protectedPage(() => <Saved />)}
              />
              <Route
                path="/recents"
                element={
                  authLoading ? null : (
                    <RecentSearches
                      key={currentUserId ?? "anonymous"}
                      currentUserId={currentUserId}
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
          element={protectedPage(() => <PointsBadges />)}
        />

        <Route
          path="/community"
          element={
            <Community
              currentUserId={currentUserId}
              onLogout={handleLogout}
            />
          }
        />

        {/* Visitor routes */}
        <Route
          path="/auth/callback"
          element={
            <AuthCallback
              authLoading={authLoading}
              currentUserId={currentUserId}
            />
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/otp" element={<OTP />} />

        <Route
          path="/forgot-password"
          element={<Forgotpassword />}
        />

        <Route
          path="/reset-password"
          element={<Resetpassword />}
        />
        <Route path="/reset-otp" element={<ResetOTP />} />
        <Route
          path="/terms-and-condition"
          element={<TermsAndConditions />}
        />

        <Route
          path="/privacy-policy"
          element={<PrivacyPolicy />}
        />

              {/* Admin routes require the admin role from user_roles */}
              <Route
                path="/admin"
                element={adminPage(() => <AdminBase />)}
              />
              <Route
                path="/admin/dashboard"
                element={adminPage(() => <Dashboard />)}
              />
              <Route
                path="/admin/routes"
                element={adminPage(() => <RouteManagement />)}
              />
              <Route
                path="/admin/post-management"
                element={adminPage(() => <PostManagement />)}
              />
              <Route
                path="/admin/reports"
                element={adminPage(() => <Reports />)}
              />
              <Route
                path="/admin/users"
                element={adminPage(() => <UserManagement />)}
              />

              {/* Unknown routes */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AccountProfileProvider>
        </SavedItemsProvider>
      </RecentSearchesProvider>
    </BrowserRouter>
  );
}

export default App;
