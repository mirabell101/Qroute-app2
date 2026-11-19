
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
 * Supports:
 * - Implicit-flow tokens.
 * - PKCE code exchange.
 * - Session recovery.
 * - Server-side role verification.
 * - Mandatory Display Name completion for Google accounts.
 */
function AuthCallback({
  onComplete,
}: AuthCallbackProps) {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Prevent duplicate OAuth exchanges in React Strict Mode.
    if (started.current) {
      return;
    }

    started.current = true;

    function cleanCallbackUrl() {
      window.history.replaceState(
        null,
        "",
        window.location.pathname,
      );
    }

    async function handleCallback() {
      const callback = parseAuthCallbackUrl(
        window.location.search,
        window.location.hash,
      );

      // Capture implicit tokens before initialization can clear the hash.
      const implicitTokens = readAuthCallbackTokens(
        window.location.search,
        window.location.hash,
      );

      if (callback.error) {
        setError(callback.error);
        cleanCallbackUrl();
        return;
      }

      // Initialize Supabase URL handling before reading the session.
      const { error: initializationError } =
        await supabase.auth.initialize();

      const {
        data,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError.message);
        cleanCallbackUrl();
        return;
      }

      let session: Session | null = data.session;

      // Recover PKCE sessions when initialization did not establish one.
      if (!session && callback.code && !initializationError) {
        const {
          data: exchangeData,
          error: exchangeError,
        } = await supabase.auth.exchangeCodeForSession(
          callback.code,
        );

        if (exchangeError) {
          setError(exchangeError.message);
          cleanCallbackUrl();
          return;
        }

        session = exchangeData.session;
      }

      // Recover implicit-flow sessions when URL detection failed.
      if (!session && !callback.code && implicitTokens) {
        const {
          data: recoveredData,
          error: recoveryError,
        } = await supabase.auth.setSession(implicitTokens);

        if (recoveryError) {
          setError(recoveryError.message);
          cleanCallbackUrl();
          return;
        }

        session = recoveredData.session;
      }

      if (!session?.access_token || !session.user?.id) {
        console.error(
          "OAuth callback did not establish a session.",
          {
            hadCode: Boolean(callback.code),
            hadImplicitTokens: Boolean(implicitTokens),
            initializationError:
              initializationError?.message ?? null,
          },
        );

        setError(
          initializationError?.message ??
            "We could not find a sign-in session. Please try again.",
        );

        cleanCallbackUrl();
        return;
      }

      let destination: string;

      try {
        destination = await completeGoogleSignIn(
          session.access_token,
          session.user.id,
        );
      } catch (completionError: unknown) {
        // Fail closed if account verification fails.
        await supabase.auth.signOut({
          scope: "local",
        });

        setError(
          completionError instanceof Error
            ? completionError.message
            : "Unable to verify your account permissions.",
        );

        cleanCallbackUrl();
        return;
      }

      cleanCallbackUrl();

      if (onComplete) {
        onComplete();
      } else {
        navigate(destination, {
          replace: true,
        });
      }
    }

    void handleCallback().catch(
      (unexpectedError: unknown) => {
        setError(
          unexpectedError instanceof Error
            ? unexpectedError.message
            : "Unable to complete sign-in.",
        );

        cleanCallbackUrl();
      },
    );
  }, [navigate, onComplete]);

  const handleReturnToSignIn = () => {
    navigate("/login", {
      replace: true,
    });
  };

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
        <div className="w-full max-w-[420px] rounded-[6px] border border-[#333] px-10 py-9 text-center">
          <h1 className="text-[24px] font-bold text-black">
            Authentication Error
          </h1>

          <p
            className="mt-4 text-sm text-red-600"
            role="alert"
          >
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
        <h1 className="text-[24px] font-bold text-black">
          Signing you in…
        </h1>

        <p className="mt-4 text-sm text-gray-600">
          Please wait while we complete your sign-in.
        </p>
      </div>
    </main>
  );
}

export default AuthCallback;
