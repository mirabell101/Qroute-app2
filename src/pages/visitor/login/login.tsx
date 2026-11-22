
import {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/lib/api";
import { completeSignIn } from "@/lib/authSession";
import { getOAuthCallbackUrl } from "@/lib/authRedirect";

import {
  getSessionSnapshot,
  isCurrentSessionAccessToken,
  subscribeSessionState,
  type SessionIdentity,
} from "@/lib/sessionCoordinator";

import {
  readRememberedLoginIdentifier,
  updateRememberedLoginIdentifier,
} from "@/lib/rememberedLoginIdentifier";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

import qrouteLogo from "@/assets/logoboi.png";
import appLogo from "@/assets/APP VER (1).png";

// ============================================================
// RESPONSE TYPES
// ============================================================

interface LoginApiResponse {
  success?: unknown;
  message?: unknown;
  code?: unknown;
  requiresEmailVerification?: unknown;
  email?: unknown;
  retryAfterSeconds?: unknown;
  scope?: unknown;

  session?: {
    access_token?: unknown;
    refresh_token?: unknown;
  } | null;

  user?: {
    id?: unknown;
  } | null;
}

// ============================================================
// SESSION HELPERS
// ============================================================

function sameSessionIdentity(
  first: SessionIdentity | null,
  second: SessionIdentity | null,
): boolean {
  if (first === null || second === null) {
    return first === second;
  }

  return (
    first.userId === second.userId &&
    first.sessionId === second.sessionId &&
    first.generation === second.generation
  );
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getResponseMessage(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" && value.trim()
    ? value
    : fallback;
}

// ============================================================
// LOGIN COMPONENT
// ============================================================

function Login() {
  const navigate = useNavigate();

  // ----------------------------------------------------------
  // SESSION COORDINATOR
  // ----------------------------------------------------------

  const sessionSnapshot = useSyncExternalStore(
    subscribeSessionState,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  /**
   * Login must not begin while the coordinator is still
   * initializing or validating an existing session.
   *
   * An error state is allowed to submit again because the
   * user may need to establish a fresh authenticated session.
   */
  const sessionReady =
    sessionSnapshot.status !== "initializing" &&
    sessionSnapshot.status !== "validating";

  // ----------------------------------------------------------
  // FORM STATE
  // ----------------------------------------------------------

  const [rememberedIdentifier] = useState(
    readRememberedLoginIdentifier,
  );

  const [showPassword, setShowPassword] =
    useState(false);

  const [identifier, setIdentifier] =
    useState(rememberedIdentifier ?? "");

  const [password, setPassword] =
    useState("");

  const [rememberMe, setRememberMe] =
    useState(rememberedIdentifier !== null);

  const [identifierError, setIdentifierError] =
    useState("");

  const [passwordError, setPasswordError] =
    useState("");

  const [loginError, setLoginError] =
    useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  // ----------------------------------------------------------
  // LOGIN LOCKOUT STATE
  // ----------------------------------------------------------

  const [lockoutSeconds, setLockoutSeconds] =
    useState(0);

  const [lockoutScope, setLockoutScope] =
    useState<"account" | "ip" | null>(null);

  useEffect(() => {
    if (lockoutSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLockoutSeconds((previous) =>
        Math.max(0, previous - 1),
      );
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [lockoutSeconds]);

  // ----------------------------------------------------------
  // SUBMISSION CONTROL
  // ----------------------------------------------------------

  const submissionLockRef = useRef(false);

  const loginAttemptRef = useRef(0);

  /**
   * Prevents duplicate submissions, including multiple clicks
   * occurring before React updates the isSubmitting state.
   */
  const beginSubmission = (): number | null => {
    if (
      submissionLockRef.current ||
      !sessionReady
    ) {
      return null;
    }

    submissionLockRef.current = true;

    const attemptId = ++loginAttemptRef.current;

    setIsSubmitting(true);

    return attemptId;
  };

  const isAttemptActive = (
    attemptId: number,
  ): boolean => {
    return loginAttemptRef.current === attemptId;
  };

  const assertAttemptActive = (
    attemptId: number,
  ): void => {
    if (!isAttemptActive(attemptId)) {
      throw new Error(
        "This sign-in attempt is no longer active.",
      );
    }
  };

  const finishSubmission = (
    attemptId: number,
  ): void => {
    if (!isAttemptActive(attemptId)) {
      return;
    }

    submissionLockRef.current = false;
    setIsSubmitting(false);
  };

  /**
   * Invalidates asynchronous work if this page is unmounted.
   */
  useEffect(() => {
    return () => {
      loginAttemptRef.current += 1;
      submissionLockRef.current = false;
    };
  }, []);

  // ----------------------------------------------------------
  // VALIDATION
  // ----------------------------------------------------------

  const validateIdentifier = (
    value: string,
  ): string => {
    if (!value.trim()) {
      return "Email address or username is required.";
    }

    if (value.trim().length > 254) {
      return "Email address or username is too long.";
    }

    return "";
  };

  const validatePassword = (
    value: string,
  ): string => {
    if (!value) {
      return "Password is required.";
    }

    return "";
  };

  // ==========================================================
  // PASSWORD LOGIN
  // ==========================================================

  const handleLogin = async (): Promise<void> => {
    if (lockoutSeconds > 0) {
      return;
    }

    const attemptId = beginSubmission();

    if (attemptId === null) {
      return;
    }

    const normalizedIdentifier = identifier.trim();

    const submittedPassword = password;

    const submittedRememberMe = rememberMe;

    const identifierValidation =
      validateIdentifier(normalizedIdentifier);

    const passwordValidation =
      validatePassword(submittedPassword);

    setIdentifierError(identifierValidation);
    setPasswordError(passwordValidation);
    setLoginError("");

    if (
      identifierValidation ||
      passwordValidation
    ) {
      finishSubmission(attemptId);
      return;
    }

    // --------------------------------------------------------
    // 1. CAPTURE THE STARTING SESSION IDENTITY
    // --------------------------------------------------------

    const initialSnapshot = getSessionSnapshot();

    const baselineIdentity = initialSnapshot.identity;

    let sessionChanged = false;

    /**
     * Watches for another login, logout, or account switch
     * while the backend is processing this login request.
     *
     * This watcher is intentionally removed before our own
     * Supabase setSession() operation begins.
     */
    const handleSessionChange = (): void => {
      const current = getSessionSnapshot();

      if (
        !sameSessionIdentity(
          current.identity,
          baselineIdentity,
        )
      ) {
        sessionChanged = true;
      }
    };

    const unsubscribeSession =
      subscribeSessionState(handleSessionChange);

    let sessionWatcherActive = true;

    const stopSessionWatcher = (): void => {
      if (!sessionWatcherActive) {
        return;
      }

      sessionWatcherActive = false;
      unsubscribeSession();
    };

    const assertOriginalSessionUnchanged = (): void => {
      assertAttemptActive(attemptId);

      const current = getSessionSnapshot();

      if (
        sessionChanged ||
        !sameSessionIdentity(
          current.identity,
          baselineIdentity,
        )
      ) {
        throw new Error(
          "Your authentication session changed while signing in. Please try again.",
        );
      }
    };

    try {
      // ------------------------------------------------------
      // 2. REQUEST AUTHENTICATION FROM THE BACKEND
      // ------------------------------------------------------

      assertOriginalSessionUnchanged();

      const response = await fetch(
        `${API_BASE_URL}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            identifier: normalizedIdentifier,
            password: submittedPassword,
          }),
        },
      );

      assertOriginalSessionUnchanged();

      // ------------------------------------------------------
      // 3. VALIDATE THE RESPONSE SHAPE
      // ------------------------------------------------------

      const rawResult: unknown = await response
        .json()
        .catch(() => null);

      assertOriginalSessionUnchanged();

      if (!isObject(rawResult)) {
        throw new Error(
          "The server returned an invalid login response.",
        );
      }

      const result =
        rawResult as LoginApiResponse;

      // ------------------------------------------------------
      // 4. EMAIL VERIFICATION REDIRECT
      // ------------------------------------------------------

      if (
        response.status === 403 &&
        result.code === "EMAIL_NOT_VERIFIED" &&
        result.requiresEmailVerification === true
      ) {
        navigate("/otp", {
          replace: true,
          state: {
            email:
              typeof result.email === "string"
                ? result.email
                : "",
          },
        });

        return;
      }

      // ------------------------------------------------------
      // 5. SERVER-ENFORCED LOCKOUT
      // ------------------------------------------------------

      if (
        response.status === 429 &&
        (
          result.code === "ACCOUNT_LOCKED" ||
          result.code === "IP_BLOCKED"
        )
      ) {
        const seconds = Math.max(
          1,
          Number(result.retryAfterSeconds) || 1,
        );

        setLockoutSeconds(seconds);

        setLockoutScope(
          result.scope === "account"
            ? "account"
            : "ip",
        );

        setLoginError(
          getResponseMessage(
            result.message,
            "Too many login attempts. Please wait before trying again.",
          ),
        );

        return;
      }

      // ------------------------------------------------------
      // 6. OTHER UNSUCCESSFUL LOGIN RESPONSES
      // ------------------------------------------------------

      if (
        !response.ok ||
        result.success !== true
      ) {
        setLoginError(
          getResponseMessage(
            result.message,
            "Unable to sign in. Please check your credentials.",
          ),
        );

        return;
      }

      // ------------------------------------------------------
      // 7. VALIDATE THE RETURNED SESSION
      // ------------------------------------------------------

      const accessToken =
        result.session?.access_token;

      const refreshToken =
        result.session?.refresh_token;

      if (
        typeof accessToken !== "string" ||
        !accessToken.trim() ||
        typeof refreshToken !== "string" ||
        !refreshToken.trim()
      ) {
        setLoginError(
          "Login succeeded, but the authentication session was not returned.",
        );

        return;
      }

      assertOriginalSessionUnchanged();

      // ------------------------------------------------------
      // 8. ESTABLISH THE SUPABASE SESSION
      // ------------------------------------------------------

      /**
       * Stop monitoring the original identity before committing
       * our own expected login session.
       *
       * The coordinator will independently observe and validate
       * the new Supabase session.
       */
      stopSessionWatcher();

      assertAttemptActive(attemptId);

      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      assertAttemptActive(attemptId);

      if (sessionError) {
        setLoginError(
          "Your login was accepted, but your session could not be established.",
        );

        return;
      }

      const establishedSession =
        sessionData.session;

      if (
        !establishedSession ||
        !establishedSession.access_token ||
        !establishedSession.user?.id
      ) {
        setLoginError(
          "Login succeeded, but Supabase did not establish an active session.",
        );

        return;
      }

      // ------------------------------------------------------
      // 9. VERIFY THE EXPECTED USER
      // ------------------------------------------------------

      if (
        typeof result.user?.id === "string" &&
        establishedSession.user.id !== result.user.id
      ) {
        setLoginError(
          "The returned authentication session does not match the expected account.",
        );

        return;
      }

      /**
       * IMPORTANT:
       *
       * Do NOT call isCurrentSessionAccessToken() here.
       *
       * setSession() has completed, but the coordinator may
       * still be processing its SIGNED_IN event and validating
       * the new identity.
       *
       * completeSignIn() waits for that validation and checks
       * that the token belongs to the exact current session.
       */
      const establishedAccessToken =
        establishedSession.access_token;

      // ------------------------------------------------------
      // 10. COMPLETE NORMAL QROUTE SIGN-IN
      // ------------------------------------------------------

      const requestedPath = new URLSearchParams(
        window.location.search,
      ).get("next");

      const destination = await completeSignIn(
        establishedAccessToken,
        requestedPath,
      );

      assertAttemptActive(attemptId);

      // ------------------------------------------------------
      // 11. FINAL SESSION OWNERSHIP CHECK
      // ------------------------------------------------------

      const finalSnapshot = getSessionSnapshot();

      const finalSessionStillActive =
        finalSnapshot.status === "authenticated" &&
        finalSnapshot.purpose === "authenticated" &&
        finalSnapshot.identity?.userId ===
          establishedSession.user.id &&
        isCurrentSessionAccessToken(
          establishedAccessToken,
        );

      if (!finalSessionStillActive) {
        throw new Error(
          "Your authentication session changed before sign-in could be completed. Please try again.",
        );
      }

      // ------------------------------------------------------
      // 12. UPDATE REMEMBERED LOGIN IDENTIFIER
      // ------------------------------------------------------

      if (
        !updateRememberedLoginIdentifier(
          normalizedIdentifier,
          submittedRememberMe,
        )
      ) {
        console.warn(
          "Could not update remembered login identifier.",
        );
      }

      // ------------------------------------------------------
      // 13. NAVIGATE TO THE VERIFIED DESTINATION
      // ------------------------------------------------------

      assertAttemptActive(attemptId);

      navigate(destination, {
        replace: true,
        state: {
          rememberMe: submittedRememberMe,
        },
      });
    } catch (error: unknown) {
      if (isAttemptActive(attemptId)) {
        console.error(
          "Login request failed:",
          error,
        );

        setLoginError(
          error instanceof Error
            ? error.message
            : "Unable to connect to the server. Please try again.",
        );
      }
    } finally {
      stopSessionWatcher();
      finishSubmission(attemptId);
    }
  };

  // ==========================================================
  // GOOGLE SIGN-IN
  // ==========================================================

  const handleGoogleSignIn = async (): Promise<void> => {
    setLoginError("");

    const attemptId = beginSubmission();

    if (attemptId === null) {
      return;
    }

    try {
      /**
       * Only the configured QRoute origin is used.
       *
       * The corresponding callback URL must also be
       * registered in Supabase Authentication URL settings.
       */
      const redirectTo = getOAuthCallbackUrl({
        configuredAppUrl: import.meta.env.VITE_APP_URL,
        currentOrigin: window.location.origin,
        allowLoopback: import.meta.env.DEV,
      });

      assertAttemptActive(attemptId);

      const { error } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            queryParams: {
              prompt: "select_account",
            },
          },
        });

      assertAttemptActive(attemptId);

      if (error) {
        setLoginError(error.message);
      }
    } catch (error: unknown) {
      if (isAttemptActive(attemptId)) {
        setLoginError(
          error instanceof Error
            ? error.message
            : "Google sign-in is not configured.",
        );
      }
    } finally {
      finishSubmission(attemptId);
    }
  };

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-white px-4">
      {/* TOP-LEFT LOGO */}

      <img
        src={qrouteLogo}
        alt="Qroute"
        className="absolute left-15 top-10 h-auto w-[160px] object-contain"
      />

      {/* LOGIN CARD */}

      <div className="w-full max-w-[450px] rounded-[6px] border border-[#e1e1e1] bg-white px-10 py-7 shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
        {/* HEADER */}

        <div className="flex items-center justify-center">
          <img
            src={appLogo}
            alt="Qroute app logo"
            className="mr-2 h-[50px] w-[50px] shrink-0 object-contain"
          />

          <div className="flex flex-col justify-center">
            <h1 className="text-[30px] font-bold leading-[1] tracking-[-0.5px] text-black">
              WELCOME
            </h1>

            <p className="mt-1 translate-x-5 text-[12px] leading-none text-black">
              Sign in your Account
            </p>
          </div>
        </div>

        {/* EMAIL OR USERNAME */}

        <div className="mt-6">
          <label
            htmlFor="identifier"
            className="text-[12px] font-medium text-black"
          >
            Email or Username
          </label>

          <Input
            id="identifier"
            type="text"
            autoComplete="username"
            placeholder="Enter your email or username"
            value={identifier}
            disabled={isSubmitting || lockoutSeconds > 0}
            onChange={(event) => {
              setIdentifier(event.target.value);
              setIdentifierError("");
              setLoginError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleLogin();
              }
            }}
            className={`mt-1.5 h-9 rounded-[5px] border px-3 text-[12px] shadow-none ${
              identifierError
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-[#b8b8b8]"
            }`}
          />

          {identifierError && (
            <p className="mt-1 px-1 text-[10px] leading-none text-red-500">
              {identifierError}
            </p>
          )}
        </div>

        {/* PASSWORD */}

        <div className="mt-3.5">
          <label
            htmlFor="password"
            className="text-[12px] font-medium text-black"
          >
            Password
          </label>

          <div className="relative mt-1.5">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              disabled={isSubmitting || lockoutSeconds > 0}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError("");
                setLoginError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleLogin();
                }
              }}
              className={`h-9 rounded-[5px] border px-3 pr-10 text-[12px] shadow-none ${
                passwordError
                  ? "border-red-500 focus-visible:ring-red-500"
                  : "border-[#b8b8b8]"
              }`}
            />

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() =>
                setShowPassword(!showPassword)
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
              aria-label={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff size={15} />
              ) : (
                <Eye size={15} />
              )}
            </button>
          </div>

          {passwordError && (
            <p className="mt-1 px-1 text-[10px] leading-none text-red-500">
              {passwordError}
            </p>
          )}
        </div>

        {/* REMEMBER ME + FORGOT PASSWORD */}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="remember"
              checked={rememberMe}
              disabled={isSubmitting}
              onCheckedChange={(checked) => {
                setRememberMe(checked === true);
              }}
              className="h-3.5 w-3.5 rounded-[2px]"
            />

            <label
              htmlFor="remember"
              className="cursor-pointer text-[10px] text-gray-700"
            >
              Remember me
            </label>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() =>
              navigate("/forgot-password")
            }
            className="text-[10px] font-medium text-[#6C3FF5] hover:underline"
          >
            Forgot Password
          </button>
        </div>

        {/* LOGIN ERROR + LOCKOUT COUNTDOWN */}

        {loginError && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-3 text-center text-[11px] text-red-500"
          >
            <p>{loginError}</p>

            {lockoutSeconds > 0 && (
              <p className="mt-1 font-semibold">
                {lockoutScope === "account"
                  ? "Account temporarily locked."
                  : "Network temporarily blocked."}{" "}
                Try again in{" "}
                {Math.floor(lockoutSeconds / 60)}:
                {String(lockoutSeconds % 60).padStart(
                  2,
                  "0",
                )}
                .
              </p>
            )}
          </div>
        )}

        {/* SIGN IN */}

        <Button
          type="button"
          disabled={
            isSubmitting ||
            lockoutSeconds > 0 ||
            !sessionReady
          }
          onClick={() => void handleLogin()}
          className="mt-4 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
        >
          {!sessionReady
            ? "Preparing Session..."
            : lockoutSeconds > 0
              ? `Try Again in ${lockoutSeconds}s`
              : isSubmitting
                ? "Signing In..."
                : "Sign In"}
        </Button>

        {/* DIVIDER */}

        <div className="my-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-300" />

          <span className="text-[9px] text-gray-500">
            or
          </span>

          <div className="h-px flex-1 bg-gray-300" />
        </div>

        {/* GOOGLE */}

        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting || !sessionReady}
          onClick={() => void handleGoogleSignIn()}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-[6px] border-gray-300 bg-white text-[11px] font-medium text-black shadow-none hover:bg-gray-50 disabled:opacity-60"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>

          Continue with Google
        </Button>

        {/* SIGN UP */}

        <div className="mt-4 text-center text-[10px]">
          <span className="text-gray-600">
            Don&apos;t have an account?{" "}
          </span>

          <button
            type="button"
            onClick={() => navigate("/signup")}
            className="font-semibold text-[#6C3FF5] hover:underline"
          >
            Sign Up
          </button>
        </div>
      </div>
    </main>
  );
}

export default Login;
