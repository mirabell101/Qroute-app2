import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./pages/visitor/Landing/Landing";
import Login from "./pages/visitor/Login/Login";
import SignUp from "./pages/visitor/SignUp/SignUp";
import OTP from "./pages/visitor/OTP/OTP";
import Forgotpassword from "./pages/visitor/Forgotpassword/Forgotpassword";
import Resetpassword from "./pages/visitor/Resetpassword/Resetpassword";
import TermsAndConditions from "./pages/visitor/Legal/TermsAndCondition";
import PrivacyPolicy from "./pages/visitor/Legal/PrivacyPolicy";

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
        <Route
  path="/"
  element={
    <Landing
      currentUserId={currentUserId}
      onLogout={handleLogout}
    />
  }
/>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/otp" element={<OTP />} />
        <Route path="/forgot-password" element={<Forgotpassword />} />
        <Route path="/reset-password" element={<Resetpassword />} />
        <Route path="/terms-and-condition" element={<TermsAndConditions />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;