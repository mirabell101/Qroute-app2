import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import AuthCallback from "./pages/auth/callback";
import Dashboard from "./pages/dashboard/dashboard";
import Login from "./pages/visitor/login/login";
import SignUp from "./pages/visitor/signup/signup";

type Page = "login" | "signup";

/**
 * Returns true when the current URL looks like it contains an OAuth callback.
 * Supabase may use the PKCE flow (code in query string) or the implicit flow
 * (access_token in the hash fragment).
 */
function isOAuthCallback(): boolean {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  return (
    params.has("code") ||
    params.has("error") ||
    hash.includes("access_token") ||
    hash.includes("error")
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [page, setPage] = useState<Page>("login");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingCallback, setIsProcessingCallback] = useState(
    isOAuthCallback,
  );

  useEffect(() => {
    // 1. Retrieve any existing session on initial load
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setIsLoading(false);
    });

    // 2. Listen for all auth state changes (sign-in, sign-out, token refresh,
    //    OAuth callback completion, password recovery, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);

      // If the callback component is still showing and a session arrived,
      // it means the OAuth exchange completed successfully.
      if (currentSession && isProcessingCallback) {
        setIsProcessingCallback(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [isProcessingCallback]);

  const handleCallbackComplete = useCallback(() => {
    setIsProcessingCallback(false);
  }, []);

  // Show a simple loading screen while the initial session is being retrieved
  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  // Show the callback handler when the URL contains OAuth parameters
  if (isProcessingCallback) {
    return <AuthCallback onComplete={handleCallbackComplete} />;
  }

  // Authenticated — show the dashboard
  if (session?.user) {
    return <Dashboard user={session.user} />;
  }

  // Not authenticated — show login / sign-up
  return page === "login" ? (
    <Login onSignUp={() => setPage("signup")} />
  ) : (
    <SignUp onSignIn={() => setPage("login")} />
  );
}

export default App;