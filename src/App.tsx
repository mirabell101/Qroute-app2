
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

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      setCurrentUserId(session?.user.id ?? null);
      setAuthLoading(false);
    });

    const restoreSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        console.error(
          "Could not restore Supabase session:",
          error.message
        );
      }

      setCurrentUserId(data.session?.user.id ?? null);
      setAuthLoading(false);
    };

    void restoreSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout failed:", error.message);
      throw error;
    }

    // Remove legacy local authentication values, if any remain.
    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");

    setCurrentUserId(null);
  };

  // Render a protected page only after authentication has been checked.
  // The callback receives a string, so protected components don't receive null.
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

        {/* Admin routes — role-based authorization is still needed */}
        <Route path="/admin" element={<AdminBase />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />

        <Route
          path="/admin/routes"
          element={<RouteManagement />}
        />

        <Route
          path="/admin/post-management"
          element={<PostManagement />}
        />

        <Route path="/admin/reports" element={<Reports />} />
        <Route path="/admin/users" element={<UserManagement />} />

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
