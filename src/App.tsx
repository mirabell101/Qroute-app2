import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { supabase } from "./lib/supabase";

import Landing from "./pages/visitor/Landing/Landing";
import Home from "./pages/registered-user/Home/Home";
import Login from "./pages/visitor/login/login";
import SignUp from "./pages/visitor/signup/signup";
import OTP from "./pages/visitor/OTP/OTP";
import Forgotpassword from "./pages/visitor/Forgotpassword/Forgotpassword";
import Resetpassword from "./pages/visitor/Resetpassword/Resetpassword";
import TermsAndConditions from "./pages/visitor/Legal/TermsAndCondition";
import PrivacyPolicy from "./pages/visitor/Legal/PrivacyPolicy";
import Profile from "./pages/registered-user/Profile/Profile";
import Contribution from "./pages/registered-user/contribution/contribution";
import Community from "./pages/registered-user/community/community";
import PointsBadges from "./pages/registered-user/points-badges/points-badges";
import AdminBase from "./pages/admin/base/base";
import Dashboard from "./pages/admin/dashboard/dashboard";
import RouteManagement from "./pages/admin/route-management/route-management";
import PostManagement from "./pages/admin/post-management/post-management";
import Reports from "./pages/admin/reports/reports";
import UserManagement from "./pages/admin/user-management/user-management";

function App() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore the existing session and listen for authentication changes.

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
    if (authLoading) {
      return null;
    }

    if (!currentUserId) {
      return <Navigate to="/login" replace />;
    }

    return renderPage(currentUserId);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route
          path="/"
          element={
            <Landing
              currentUserId={currentUserId}
              onLogout={handleLogout}
            />
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
          element={protectedPage((userId) => (
            <PointsBadges
              currentUserId={userId}
              onLogout={handleLogout}
            />
          ))}
        />

        <Route
          path="/community"
          element={protectedPage((userId) => (
            <Community
              currentUserId={userId}
              onLogout={handleLogout}
            />
          ))}
        />

        {/* Visitor routes */}
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

        <Route
          path="/terms-and-condition"
          element={<TermsAndConditions />}
        />

        <Route
          path="/privacy-policy"
          element={<PrivacyPolicy />}
        />

        {/* Admin routes: authorization still needs to be enforced */}
        <Route path="/admin" element={<AdminBase />} />

        <Route
          path="/admin/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/admin/routes"
          element={<RouteManagement />}
        />

        <Route
          path="/admin/post-management"
          element={<PostManagement />}
        />

        <Route
          path="/admin/reports"
          element={<Reports />}
        />

        <Route
          path="/admin/users"
          element={<UserManagement />}
        />

        {/* Unknown routes */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
