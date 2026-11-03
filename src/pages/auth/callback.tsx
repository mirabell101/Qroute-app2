import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthCallbackProps = {
  onComplete: () => void;
};

/**
 * Handles the OAuth callback after a user is redirected back from Google.
 *
 * When Supabase uses the PKCE flow (default for SPAs), the redirect URL
 * contains a `code` query parameter. The Supabase client automatically
 * exchanges this code for a session via `exchangeCodeForSession`.
 *
 * When using the implicit flow, the redirect URL contains tokens in the
 * hash fragment, which the Supabase client detects automatically.
 *
 * This component shows a loading state while the session exchange happens
 * and displays any errors that occur during the process.
 */
function AuthCallback({ onComplete }: AuthCallbackProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      // Check for error parameters in the URL (e.g. user denied consent)
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));

      const errorParam = params.get("error") || hashParams.get("error");
      const errorDescription =
        params.get("error_description") || hashParams.get("error_description");

      if (errorParam) {
        setError(errorDescription || `Authentication failed: ${errorParam}`);
        // Clean the URL without reloading the page
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }

      // If there's a code parameter, Supabase needs to exchange it for a session.
      // The Supabase client's `onAuthStateChange` listener (set up in App.tsx)
      // will automatically detect the new session once the exchange completes.
      // For the PKCE flow, we call exchangeCodeForSession explicitly.
      const code = params.get("code");
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(exchangeError.message);
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }

      // For the implicit flow (hash fragment), the Supabase client detects
      // the tokens automatically. We just need to wait for the auth state
      // change listener to fire, which will call onComplete.

      // Clean the URL
      window.history.replaceState(null, "", window.location.pathname);
      onComplete();
    }

    handleCallback();
  }, [onComplete]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
        <div className="w-full max-w-[420px] rounded-[6px] border border-[#333] px-10 py-9 text-center">
          <h1 className="text-[24px] font-bold text-black">
            Authentication Error
          </h1>
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={onComplete}
            className="mt-6 text-sm font-semibold text-[#6C3FF5] hover:underline"
          >
            Return to Sign In
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-[420px] rounded-[6px] border border-[#333] px-10 py-9 text-center">
        <h1 className="text-[24px] font-bold text-black">Signing you in…</h1>
        <p className="mt-4 text-sm text-gray-600">
          Please wait while we complete your sign-in.
        </p>
      </div>
    </main>
  );
}

export default AuthCallback;
