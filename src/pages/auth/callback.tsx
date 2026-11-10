import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import {
  parseAuthCallbackUrl,
  readAuthCallbackTokens,
} from "@/lib/authCallback";
import { completeGoogleSignIn } from "@/lib/authSession";
import { supabase } from "@/lib/supabase";

type AuthCallbackProps = {
  authLoading: boolean;
  currentUserId: string | null;
  onComplete?: () => void;
};

/**
 * Handles the OAuth callback after a user is redirected back from Google.
 *
 * Supabase can complete the sign-in in either flow:
 * - implicit flow: tokens are in the URL hash and the client stores them
 *   while it initializes;
 * - PKCE flow: the URL has a single-use `code` and the client exchanges it
 *   while it initializes when the matching verifier is in storage.
 *
 * The callback therefore waits for client initialization before deciding that
 * no session exists. Without that wait, a hidden initialization error looks
 * like "no session", which is the generic error this screen used to show.
 *
 * The destination is never taken from an untrusted URL. Both successful
 * sign-in paths run through the same role check used by password login.
 */
function AuthCallback({
  onComplete,
}: AuthCallbackProps) {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // React Strict Mode runs effects twice in development. The PKCE code is
    // single-use, so the exchange must only start once.
    if (started.current) {
      return;
    }

    started.current = true;

    function cleanCallbackUrl() {
      window.history.replaceState(null, "", window.location.pathname);
    }

    async function handleCallback() {
      const callback = parseAuthCallbackUrl(
        window.location.search,
        window.location.hash
      );

      // Capture implicit-flow tokens before initialization clears the hash.
      // They are only used later if the client could not establish a session.
      const implicitTokens = readAuthCallbackTokens(
        window.location.search,
        window.location.hash
      );

      // Check for error parameters in the URL (e.g. user denied consent).
      if (callback.error) {
        setError(callback.error);
        cleanCallbackUrl();
        return;
      }

      // The client reads the URL during initialization. Awaiting it gives us
      // the URL-detection error that getSession() hides, rather than treating
      // a real failure as an empty session.
      const { error: initializationError } = await supabase.auth.initialize();

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        cleanCallbackUrl();
        return;
      }

      let session: Session | null = data.session;

      // With detectSessionInUrl enabled, an existing PKCE verifier means the
      // client already exchanged the code during initialization. Only
      // exchange manually when initialization did not attempt the exchange,
      // otherwise the single-use code would be redeemed twice.
      if (!session && callback.code && !initializationError) {
        const { data: exchangeData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(callback.code);

        if (exchangeError) {
          setError(exchangeError.message);
          cleanCallbackUrl();
          return;
        }

        session = exchangeData.session;
      }

      // If the client could not detect an implicit-flow session, the hash
      // tokens may still be untouched. Retry them through setSession so a
      // transient detection failure (or a missing expiry parameter) does not
      // block an otherwise valid Google sign-in. setSession verifies the
      // access token with Supabase Auth before storing anything.
      if (!session && !callback.code && implicitTokens) {
        const { data: recoveredData, error: recoveryError } =
          await supabase.auth.setSession(implicitTokens);

        if (recoveryError) {
          setError(recoveryError.message);
          cleanCallbackUrl();
          return;
        }

        session = recoveredData.session;
      }

      if (!session?.access_token) {
        console.error("OAuth callback did not establish a session.", {
          hadCode: Boolean(callback.code),
          initializationError: initializationError?.message ?? null,
        });

        setError(
          initializationError?.message ??
            "We could not find a sign-in session. Please try again."
        );
        cleanCallbackUrl();
        return;
      }

      let destination: string;

      try {
        destination = await completeGoogleSignIn(session.access_token);
      } catch (completionError) {
        // Fail closed instead of leaving a session with no verified role.
        await supabase.auth.signOut({ scope: "local" });

        setError(
          completionError instanceof Error
            ? completionError.message
            : "Unable to verify your account permissions."
        );
        cleanCallbackUrl();
        return;
      }

      cleanCallbackUrl();

      if (onComplete) {
        onComplete();
      } else {
        navigate(destination, { replace: true });
      }
    }
    void handleCallback().catch((unexpectedError: unknown) => {
      setError(
        unexpectedError instanceof Error
          ? unexpectedError.message
          : "Unable to complete sign-in."
      );
      cleanCallbackUrl();
    });
  }, [navigate, onComplete]);

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
