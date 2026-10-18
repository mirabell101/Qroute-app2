import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Landing from "./pages/visitor/landing/landing";
import Home from "./pages/registered-user/home/home";
import Login from "./pages/visitor/login/login";
import SignUp from "./pages/visitor/signup/signup";
import OTP from "./pages/visitor/otp/otp";
import Forgotpassword from "./pages/visitor/forgotpassword/forgotpassword";
import Resetpassword from "./pages/visitor/resetpassword/resetpassword";
import TermsAndConditions from "./pages/visitor/legal/termsandcondition";
import PrivacyPolicy from "./pages/visitor/legal/privacypolicy";
import Profile from "./pages/registered-user/profile/profile";
import Contribution from "./pages/registered-user/contribution/contribution";
import Community from "./pages/registered-user/community/community";
import AdminBase from "./pages/admin/base/base";

const CURRENT_USER_KEY = "qroute_current_user";

function getCurrentUserId(): string | null {
  const persistentUser = localStorage.getItem(CURRENT_USER_KEY);

  if (persistentUser) {
    return persistentUser;
  }

  const sessionUser = sessionStorage.getItem(CURRENT_USER_KEY);

  if (sessionUser) {
    return sessionUser;
  }

  return null;
}

function App() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    getCurrentUserId()
  );

  const handleLogout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    sessionStorage.removeItem(CURRENT_USER_KEY);
    setCurrentUserId(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Base routes: accessible without login */}
        <Route path="/" element={<Landing currentUserId={currentUserId} onLogout={handleLogout} />} />
        <Route path="/base" element={<Landing currentUserId={currentUserId} onLogout={handleLogout} />} />

        {/* Registered-user routes */}
        <Route
          path="/home"
          element={
            currentUserId ? (
              <Home currentUserId={currentUserId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/contribution"
          element={
            currentUserId ? (
              <Contribution currentUserId={currentUserId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/profile"
          element={
            currentUserId ? (
              <Profile currentUserId={currentUserId} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Community remains accessible to guests */}
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
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/otp" element={<OTP />} />
        <Route path="/forgot-password" element={<Forgotpassword />} />
        <Route path="/reset-password" element={<Resetpassword />} />
        <Route path="/terms-and-condition" element={<TermsAndConditions />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />

        {/* Admin */}
        <Route path="/admin" element={<AdminBase />} />

        {/* Unknown routes return to the base page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;