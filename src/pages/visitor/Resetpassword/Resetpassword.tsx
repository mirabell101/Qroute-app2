
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import qrouteLogo from "@/assets/logoboi.png";

import { API_BASE_URL } from "@/lib/api";

import {
  getPasswordRecoveryClient,
  clearPasswordRecoverySession,
} from "@/lib/passwordRecoveryClient";

import {
  validateRecoveryPassword,
  validateRecoveryPasswordConfirmation,
} from "@/lib/passwordRecovery";

// ============================================================
// TYPES
// ============================================================

type RecoveryStatus =
  | "checking"
  | "ready"
  | "invalid"
  | "success";

interface RecoveryContext {
  userId: string;
  accessToken: string;
}

interface ResetPasswordResponse {
  success?: boolean;
  message?: string;
}

const INVALID_RECOVERY_MESSAGE =
  "This password reset link is invalid, expired, or already used. Request a new link to try again.";

const GENERIC_RESET_ERROR =
  "Unable to update your password. Please try again.";

// ============================================================
// RESPONSE VALIDATION
// ============================================================

function isResetPasswordResponse(
  value: unknown,
): value is ResetPasswordResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

// ============================================================
// COMPONENT
// ============================================================

function Resetpassword() {
  const location = useLocation();

  // ----------------------------------------------------------
  // FORM STATE
  // ----------------------------------------------------------

  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryStatus>("checking");

  const [recoveryMessage, setRecoveryMessage] =
    useState("");

  const [recoveryContext, setRecoveryContext] =
    useState<RecoveryContext | null>(null);

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [passwordError, setPasswordError] =
    useState("");

  const [confirmPasswordError, setConfirmPasswordError] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  // ----------------------------------------------------------
  // LIFECYCLE AND CONCURRENCY CONTROL
  // ----------------------------------------------------------

  const mounted = useRef(false);

  const isSubmitting = useRef(false);

  const passwordUpdated = useRef(false);

  const verificationGeneration = useRef(0);

  // ----------------------------------------------------------
  // 1. COMPONENT LIFECYCLE
  // ----------------------------------------------------------

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;

      // Invalidate pending recovery verification.
      verificationGeneration.current += 1;
    };
  }, []);

  // ----------------------------------------------------------
  // 2. VERIFY THE DEDICATED RECOVERY SESSION
  // ----------------------------------------------------------

  useEffect(() => {
    let active = true;

    const generation =
      ++verificationGeneration.current;

    const isCurrentVerification = (): boolean => {
      return (
        active &&
        mounted.current &&
        generation === verificationGeneration.current &&
        !passwordUpdated.current
      );
    };

    const markInvalid = (): void => {
      if (!isCurrentVerification()) {
        return;
      }

      setRecoveryStatus("invalid");
      setRecoveryContext(null);
      setRecoveryMessage(
        INVALID_RECOVERY_MESSAGE,
      );
    };

    const verifyRecoverySession =
      async (): Promise<void> => {
        if (!isCurrentVerification()) {
          return;
        }

        try {
          const recoveryClient =
            getPasswordRecoveryClient();

          /**
           * getSession retrieves the isolated recovery session.
           * The dedicated recovery client handles recovery
           * URL detection and initialization.
           */
          const {
            data: { session },
            error: sessionError,
          } = await recoveryClient.auth.getSession();

          if (!isCurrentVerification()) {
            return;
          }

          if (
            sessionError ||
            !session?.access_token ||
            !session.user?.id
          ) {
            markInvalid();
            return;
          }

          // --------------------------------------------------
          // VERIFY THE USER THROUGH SUPABASE AUTH
          // --------------------------------------------------

          const {
            data: { user },
            error: userError,
          } = await recoveryClient.auth.getUser(
            session.access_token,
          );

          if (!isCurrentVerification()) {
            return;
          }

          if (
            userError ||
            !user ||
            user.id !== session.user.id
          ) {
            markInvalid();
            return;
          }

          // --------------------------------------------------
          // CONFIRM THE SESSION DID NOT CHANGE DURING VERIFY
          // --------------------------------------------------

          const {
            data: { session: latestSession },
            error: latestSessionError,
          } = await recoveryClient.auth.getSession();

          if (!isCurrentVerification()) {
            return;
          }

          const sameRecoverySession =
            !latestSessionError &&
            latestSession !== null &&
            latestSession.user.id === user.id &&
            latestSession.access_token ===
              session.access_token;

          if (!sameRecoverySession) {
            markInvalid();
            return;
          }

          // --------------------------------------------------
          // RECOVERY SESSION IS READY
          // --------------------------------------------------

          setRecoveryContext({
            userId: user.id,
            accessToken: session.access_token,
          });

          setRecoveryStatus("ready");
          setRecoveryMessage("");
        } catch (error: unknown) {
          console.error(
            "Password-recovery session verification failed:",
            error,
          );

          markInvalid();
        }
      };

    void verifyRecoverySession();

    return () => {
      active = false;

      // Invalidate this verification if it is still current.
      if (
        generation === verificationGeneration.current
      ) {
        verificationGeneration.current += 1;
      }
    };
  }, [
    location.pathname,
    location.search,
    location.hash,
  ]);

  // ----------------------------------------------------------
  // 3. RESET PASSWORD
  // ----------------------------------------------------------

  const handleResetPassword =
    async (): Promise<void> => {
      if (
        isSubmitting.current ||
        recoveryStatus !== "ready" ||
        !recoveryContext ||
        !mounted.current
      ) {
        return;
      }

      // ------------------------------------------------------
      // VALIDATE THE FORM
      // ------------------------------------------------------

      const passwordValidation =
        validateRecoveryPassword(password);

      const confirmPasswordValidation =
        validateRecoveryPasswordConfirmation(
          password,
          confirmPassword,
        );

      setPasswordError(passwordValidation);

      setConfirmPasswordError(
        confirmPasswordValidation,
      );

      if (
        passwordValidation ||
        confirmPasswordValidation ||
        isLoading
      ) {
        return;
      }

      // Capture the exact recovery identity and submitted value.
      const capturedUserId =
        recoveryContext.userId;

      const capturedAccessToken =
        recoveryContext.accessToken;

      const capturedPassword = password;

      isSubmitting.current = true;

      setIsLoading(true);

      try {
        const recoveryClient =
          getPasswordRecoveryClient();

        // ----------------------------------------------------
        // A. CONFIRM THE EXACT RECOVERY SESSION
        // ----------------------------------------------------

        const {
          data: { session },
          error: sessionError,
        } = await recoveryClient.auth.getSession();

        const sameInitialRecoverySession =
          !sessionError &&
          session !== null &&
          session.user.id === capturedUserId &&
          session.access_token === capturedAccessToken;

        if (!sameInitialRecoverySession) {
          if (mounted.current) {
            setRecoveryStatus("invalid");
            setRecoveryContext(null);
            setRecoveryMessage(
              INVALID_RECOVERY_MESSAGE,
            );
          }

          return;
        }

        // ----------------------------------------------------
        // B. SEND THE PASSWORD UPDATE TO THE BACKEND
        // ----------------------------------------------------

        const response = await fetch(
          `${API_BASE_URL}/api/auth/reset-password`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${capturedAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              password: capturedPassword,
            }),
          },
        );

        const result: unknown = await response
          .json()
          .catch(() => null);

        const parsedResult =
          isResetPasswordResponse(result)
            ? result
            : null;

        const successfulResponse =
          response.ok &&
          parsedResult?.success === true;

        // ----------------------------------------------------
        // C. RECHECK THE RECOVERY SESSION
        // ----------------------------------------------------

        const {
          data: { session: latestSession },
          error: latestSessionError,
        } = await recoveryClient.auth.getSession();

        const sameRecoverySession =
          !latestSessionError &&
          latestSession !== null &&
          latestSession.user.id === capturedUserId &&
          latestSession.access_token ===
            capturedAccessToken;

        // ----------------------------------------------------
        // D. HANDLE A SESSION CHANGE AFTER SUBMISSION
        // ----------------------------------------------------

        if (!sameRecoverySession) {
          if (!mounted.current) {
            return;
          }

          setRecoveryContext(null);

          /**
           * If the backend confirmed the password update,
           * the password has already been changed.
           *
           * Do not report that operation as a failure.
           * Do not sign out a replacement recovery session.
           */
          if (successfulResponse) {
            passwordUpdated.current = true;

            setPassword("");
            setConfirmPassword("");
            setPasswordError("");
            setConfirmPasswordError("");

            setRecoveryMessage(
              "Your password was updated successfully. The recovery session changed during the operation, so the replacement session was left untouched. Return to Sign In and use your new password.",
            );

            setRecoveryStatus("success");

            return;
          }

          setRecoveryStatus("invalid");

          setRecoveryMessage(
            INVALID_RECOVERY_MESSAGE,
          );

          return;
        }

        // ----------------------------------------------------
        // E. HANDLE INVALID RECOVERY AUTHORIZATION
        // ----------------------------------------------------

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          if (mounted.current) {
            setRecoveryStatus("invalid");
            setRecoveryContext(null);
            setRecoveryMessage(
              INVALID_RECOVERY_MESSAGE,
            );
          }

          return;
        }

        // ----------------------------------------------------
        // F. HANDLE OTHER UNSUCCESSFUL RESPONSES
        // ----------------------------------------------------

        if (!successfulResponse) {
          if (!mounted.current) {
            return;
          }

          if (response.status === 429) {
            setPasswordError(
              "Too many password reset attempts. Please wait before trying again.",
            );

            return;
          }

          if (
            response.status === 400 &&
            typeof parsedResult?.message === "string" &&
            parsedResult.message.trim()
          ) {
            setPasswordError(
              parsedResult.message,
            );

            return;
          }

          setPasswordError(
            GENERIC_RESET_ERROR,
          );

          return;
        }

        // ----------------------------------------------------
        // G. PASSWORD UPDATE SUCCEEDED
        // ----------------------------------------------------

        passwordUpdated.current = true;

        let successMessage =
          "Your password was updated. Sign in with your new password.";

        if (mounted.current) {
          setPassword("");
          setConfirmPassword("");
          setPasswordError("");
          setConfirmPasswordError("");
        }

        // ----------------------------------------------------
        // H. CLEAR ONLY THE EXPECTED RECOVERY SESSION
        // ----------------------------------------------------

        try {
          /**
           * The helper independently checks that the
           * recovery session still belongs to the same
           * user and exact access token.
           *
           * It will not intentionally clear a replacement
           * recovery session.
           */
          const recoverySessionCleared =
            await clearPasswordRecoverySession({
              userId: capturedUserId,
              accessToken: capturedAccessToken,
            });

          if (!recoverySessionCleared) {
            successMessage =
              "Your password was updated, but a different recovery session became active before cleanup. That session was left untouched. Return to Sign In and use your new password.";
          }
        } catch (error: unknown) {
          console.error(
            "Could not clear the recovery session:",
            error,
          );

          successMessage =
            "Your password was updated, but the recovery session could not be cleared. Return to Sign In before using your new password.";
        }

        if (!mounted.current) {
          return;
        }

        setRecoveryMessage(successMessage);
        setRecoveryStatus("success");
      } catch (error: unknown) {
        console.error(
          "Password recovery request failed:",
          error,
        );

        if (mounted.current) {
          setPasswordError(
            GENERIC_RESET_ERROR,
          );
        }
      } finally {
        isSubmitting.current = false;

        if (mounted.current) {
          setIsLoading(false);
        }
      }
    };

  // ----------------------------------------------------------
  // UI
  // ----------------------------------------------------------

  return (
    <main className="relative flex min-h-screen w-screen items-center justify-center overflow-x-hidden bg-white px-4 py-8">
      <img
        src={qrouteLogo}
        alt="QRoute"
        className="absolute left-6 top-6 h-auto w-[130px] object-contain sm:left-15 sm:top-10 sm:w-[160px]"
      />

      <div className="w-full max-w-[450px] rounded-[6px] border border-[#e1e1e1] bg-white px-6 py-7 shadow-[0_1px_6px_rgba(0,0,0,0.08)] sm:px-10">
        <div className="flex items-center justify-center">
          <div className="flex flex-col justify-center">
            <h1 className="text-[30px] font-bold leading-[1] tracking-[-0.5px] text-black">
              {recoveryStatus === "success"
                ? "Password Updated"
                : "Set a New Password"}
            </h1>

            <p className="mt-1 translate-x-10 text-[12px] leading-none text-black">
              {recoveryStatus === "checking"
                ? "Verifying your reset link..."
                : recoveryStatus === "success"
                  ? "Your account is ready for sign in."
                  : "Must meet all password requirements."}
            </p>
          </div>
        </div>

        {/* CHECKING */}

        {recoveryStatus === "checking" && (
          <p
            role="status"
            className="mt-6 text-center text-[12px] text-gray-600"
          >
            Please wait while we verify your password reset link.
          </p>
        )}

        {/* INVALID LINK */}

        {recoveryStatus === "invalid" && (
          <div className="mt-6 text-center">
            <p
              role="alert"
              className="text-[12px] leading-relaxed text-red-600"
            >
              {recoveryMessage ||
                INVALID_RECOVERY_MESSAGE}
            </p>

            <Button
              type="button"
              onClick={() =>
                window.location.replace(
                  "/forgot-password",
                )
              }
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              Request a New Reset Link
            </Button>
          </div>
        )}

        {/* SUCCESS */}

        {recoveryStatus === "success" && (
          <div className="mt-6 text-center">
            <p
              role="status"
              className="text-[12px] leading-relaxed text-gray-700"
            >
              {recoveryMessage}
            </p>

            <Button
              type="button"
              onClick={() =>
                window.location.replace("/login")
              }
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              Return to Sign In
            </Button>
          </div>
        )}

        {/* READY */}

        {recoveryStatus === "ready" && (
          <>
            <div className="mt-5">
              <label
                htmlFor="password"
                className="text-[12px] font-medium text-black"
              >
                Password
              </label>

              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  placeholder="Enter your password"
                  value={password}
                  disabled={isLoading}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setPasswordError("");

                    if (
                      confirmPassword ===
                      event.target.value
                    ) {
                      setConfirmPasswordError("");
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
                  disabled={isLoading}
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
                <p
                  role="alert"
                  className="mt-1 px-1 text-[10px] leading-tight text-red-500"
                >
                  {passwordError}
                </p>
              )}
            </div>

            <div className="mt-3.5">
              <label
                htmlFor="confirmPassword"
                className="text-[12px] font-medium text-black"
              >
                Confirm Password
              </label>

              <div className="relative mt-1.5">
                <Input
                  id="confirmPassword"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  placeholder="Enter your password again"
                  value={confirmPassword}
                  disabled={isLoading}
                  onChange={(event) => {
                    setConfirmPassword(
                      event.target.value,
                    );

                    setConfirmPasswordError("");
                  }}
                  className={`h-9 rounded-[5px] border px-3 pr-10 text-[12px] shadow-none ${
                    confirmPasswordError
                      ? "border-red-500 focus-visible:ring-red-500"
                      : "border-[#b8b8b8]"
                  }`}
                />

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() =>
                    setShowConfirmPassword(
                      !showConfirmPassword,
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                  aria-label={
                    showConfirmPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={15} />
                  ) : (
                    <Eye size={15} />
                  )}
                </button>
              </div>

              {confirmPasswordError && (
                <p
                  role="alert"
                  className="mt-1 px-1 text-[10px] leading-tight text-red-500"
                >
                  {confirmPasswordError}
                </p>
              )}
            </div>

            <Button
              type="button"
              disabled={isLoading}
              onClick={() =>
                void handleResetPassword()
              }
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              {isLoading
                ? "Resetting password..."
                : "Reset Password"}
            </Button>

            <div className="mt-4 text-center text-[10px]">
              <span className="text-gray-600">
                Remember your password?{" "}
              </span>

              <button
                type="button"
                onClick={() =>
                  window.location.replace("/login")
                }
                className="font-semibold text-[#6C3FF5] hover:underline"
              >
                Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default Resetpassword;
