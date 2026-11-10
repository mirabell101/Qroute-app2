import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import qrouteLogo from "@/assets/logoboi.png";
import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  isPasswordRecoveryCallback,
  validateRecoveryPassword,
  validateRecoveryPasswordConfirmation,
} from "@/lib/passwordRecovery";

type RecoveryStatus = "checking" | "ready" | "invalid" | "success";

const INVALID_RECOVERY_MESSAGE =
  "This password reset link is invalid, expired, or already used. Request a new link to try again.";

function Resetpassword() {
  const location = useLocation();

  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryStatus>("checking");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isSubmitting = useRef(false);
  const passwordUpdated = useRef(false);

  useEffect(() => {
    let active = true;
    let recoveryDetected = isPasswordRecoveryCallback(
      location.search,
      location.hash,
    );

    const markInvalid = () => {
      if (!active) return;
      setRecoveryStatus("invalid");
      setRecoveryMessage(INVALID_RECOVERY_MESSAGE);
    };

    const verifySession = async (session: Session | null) => {
      if (!active) return;
      if (!recoveryDetected || !session?.access_token) {
        markInvalid();
        return;
      }

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(session.access_token);

        if (!active) return;
        if (error || !user) {
          markInvalid();
          return;
        }

        setRecoveryStatus("ready");
        setRecoveryMessage("");
      } catch {
        markInvalid();
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryDetected = true;
        window.setTimeout(() => {
          void verifySession(session);
        }, 0);
      } else if (event === "SIGNED_OUT" && !passwordUpdated.current) {
        markInvalid();
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!active) return;
        if (error || !session) {
          markInvalid();
          return;
        }
        if (!recoveryDetected) {
          markInvalid();
          return;
        }
        void verifySession(session);
      })
      .catch(markInvalid);

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [location.hash, location.search]);

  const handleResetPassword = async () => {
    if (isSubmitting.current || recoveryStatus !== "ready") return;

    const passwordValidation = validateRecoveryPassword(password);
    const confirmPasswordValidation =
      validateRecoveryPasswordConfirmation(password, confirmPassword);

    setPasswordError(passwordValidation);
    setConfirmPasswordError(confirmPasswordValidation);

    if (passwordValidation || confirmPasswordValidation || isLoading) {
      return;
    }

    isSubmitting.current = true;
    setIsLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setRecoveryStatus("invalid");
        setRecoveryMessage(INVALID_RECOVERY_MESSAGE);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/auth/reset-password`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password }),
        },
      );
      const result: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        setRecoveryStatus("invalid");
        setRecoveryMessage(INVALID_RECOVERY_MESSAGE);
        return;
      }

      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("success" in result) ||
        result.success !== true
      ) {
        setPasswordError("Unable to update your password. Please try again.");
        return;
      }

      passwordUpdated.current = true;
      setPassword("");
      setConfirmPassword("");
      setPasswordError("");
      setConfirmPasswordError("");

      let successMessage =
        "Your password was updated. Sign in with your new password.";
      try {
        const { error: signOutError } = await supabase.auth.signOut({
          scope: "local",
        });
        if (signOutError) {
          successMessage =
            "Your password was updated, but this session could not be cleared. Sign out before signing in again.";
        }
      } catch {
        successMessage =
          "Your password was updated, but this session could not be cleared. Sign out before signing in again.";
      }

      setRecoveryMessage(successMessage);
      setRecoveryStatus("success");
    } catch {
      setPasswordError("Unable to update your password. Please try again.");
    } finally {
      isSubmitting.current = false;
      setIsLoading(false);
    }
  };

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

        {recoveryStatus === "checking" && (
          <p role="status" className="mt-6 text-center text-[12px] text-gray-600">
            Please wait while we verify your password reset link.
          </p>
        )}

        {recoveryStatus === "invalid" && (
          <div className="mt-6 text-center">
            <p role="alert" className="text-[12px] leading-relaxed text-red-600">
              {recoveryMessage || INVALID_RECOVERY_MESSAGE}
            </p>
            <Button
              type="button"
              onClick={() => window.location.replace("/forgot-password")}
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              Request a New Reset Link
            </Button>
          </div>
        )}

        {recoveryStatus === "success" && (
          <div className="mt-6 text-center">
            <p role="status" className="text-[12px] leading-relaxed text-gray-700">
              {recoveryMessage}
            </p>
            <Button
              type="button"
              onClick={() => window.location.replace("/login")}
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              Return to Sign In
            </Button>
          </div>
        )}

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
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Enter your password"
                  value={password}
                  disabled={isLoading}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setPasswordError("");
                    if (confirmPassword === event.target.value) {
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
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
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
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Enter your password again"
                  value={confirmPassword}
                  disabled={isLoading}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
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
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
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
              onClick={() => void handleResetPassword()}
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              {isLoading ? "Resetting password..." : "Reset Password"}
            </Button>

            <div className="mt-4 text-center text-[10px]">
              <span className="text-gray-600">Remember your password? </span>
              <button
                type="button"
                onClick={() => window.location.replace("/login")}
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
