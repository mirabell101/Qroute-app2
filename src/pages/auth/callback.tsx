import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getOAuthCallbackDestination,
  getOAuthCallbackError,
} from "@/lib/authCallback";

type AuthCallbackProps = {
  authLoading: boolean;
  currentUserId: string | null;
};

/**
 * Handles the OAuth callback after a user is redirected back from Google.
 *
 * The Supabase client detects the callback URL and establishes the session.
 * This component waits for App's session validation before navigating.
 */
function AuthCallback({
  authLoading,
  currentUserId,
}: AuthCallbackProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const error = getOAuthCallbackError(location.search, location.hash);

  useEffect(() => {
    if (error) {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    const destination = getOAuthCallbackDestination(
      authLoading,
      currentUserId,
    );
    if (!destination) return;

    window.history.replaceState(null, "", window.location.pathname);
    navigate(destination, { replace: true });
  }, [
    authLoading,
    currentUserId,
    error,
    location.hash,
    location.search,
    navigate,
  ]);

  const handleReturnToSignIn = () => {
    navigate("/login", { replace: true });
  };

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
            onClick={handleReturnToSignIn}
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
