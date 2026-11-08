import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import qrouteLogo from "@/assets/logoboi.png";
import { API_BASE_URL } from "@/lib/api";
import { validateRecoveryEmail } from "@/lib/passwordRecovery";

function Forgotpassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isSubmitting = useRef(false);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timeout = window.setTimeout(() => {
      setCooldownSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [cooldownSeconds]);

  const handleContinue = async () => {
    if (
      isSubmitting.current ||
      hasSubmitted ||
      cooldownSeconds > 0
    ) {
      return;
    }

    const emailValidation = validateRecoveryEmail(email);

    setEmailError(emailValidation);

    if (emailValidation || isLoading) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    isSubmitting.current = true;
    setIsLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
          }),
        }
      );

      const data: unknown = await response.json().catch(() => null);

      if (response.status === 429) {
        const responseBody =
          typeof data === "object" && data !== null ? data : null;
        const retryAfterSeconds =
          responseBody &&
          "retryAfterSeconds" in responseBody &&
          typeof responseBody.retryAfterSeconds === "number" &&
          Number.isInteger(responseBody.retryAfterSeconds) &&
          responseBody.retryAfterSeconds > 0
            ? Math.min(responseBody.retryAfterSeconds, 15 * 60)
            : 60;

        setCooldownSeconds(retryAfterSeconds);
        setEmailError(
          responseBody &&
            "message" in responseBody &&
            typeof responseBody.message === "string"
            ? responseBody.message
            : "Password recovery requests are temporarily limited. Please wait before trying again.",
        );
        return;
      }

      if (
        !response.ok ||
        typeof data !== "object" ||
        data === null ||
        !("success" in data) ||
        data.success !== true
      ) {
        setEmailError("Unable to process your request. Please try again.");
        return;
      }

      setEmailError("");
      setHasSubmitted(true);
    } catch {
      setEmailError("Unable to process your request. Please try again.");
    } finally {
      isSubmitting.current = false;
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-white px-4">
      {/* TOP-LEFT LOGO */}
      <img
        src={qrouteLogo}
        alt="QRoute"
        className="absolute left-15 top-10 h-auto w-[160px] object-contain"
      />

      {/* FORGOT PASSWORD CARD */}
      <div className="w-full max-w-[450px] rounded-[6px] border border-[#e1e1e1] bg-white px-10 py-7 shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
        {/* HEADER */}
        <div className="flex items-center justify-center">
          <div className="flex flex-col justify-center">
            <h1 className="text-[30px] font-bold leading-[1] tracking-[-0.5px] text-black">
              Forgot Password
            </h1>

            <p className="mt-1 translate-x-10 text-[12px] leading-none text-black">
              Enter your registered Gmail.
            </p>
          </div>
        </div>

        {hasSubmitted ? (
          <div className="mt-6 text-center">
            <p role="status" className="text-[12px] leading-relaxed text-gray-700">
              If an account exists for that email, a password reset link will
              be sent. Check your inbox.
            </p>
            <Button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              Return to Sign In
            </Button>
          </div>
        ) : (
          <>
            {/* EMAIL */}
            <div className="mt-6">
              <label
                htmlFor="email"
                className="text-[12px] font-medium text-black"
              >
                Gmail
              </label>

              <div className="relative mt-1.5">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="Enter your Gmail address"
                  value={email}
                  disabled={isLoading}
                  onChange={(event) => {
                    setEmail(event.target.value);

                    if (emailError) {
                      setEmailError("");
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleContinue();
                    }
                  }}
                  className={`h-9 rounded-[5px] border px-3 text-[12px] shadow-none ${
                    emailError
                      ? "border-red-500 focus-visible:ring-red-500"
                      : "border-[#b8b8b8]"
                  }`}
                />
              </div>

              {emailError && (
                <p
                  role="alert"
                  className="mt-1 px-1 text-[10px] leading-tight text-red-500"
                >
                  {emailError}
                </p>
              )}
            </div>

            {/* CONTINUE */}
            <Button
              type="button"
              disabled={isLoading || cooldownSeconds > 0}
              onClick={() => void handleContinue()}
              className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
            >
              {isLoading
                ? "Sending link..."
                : cooldownSeconds > 0
                  ? `Try again in ${Math.floor(cooldownSeconds / 60)}:${String(
                      cooldownSeconds % 60,
                    ).padStart(2, "0")}`
                  : "Send Reset Link"}
            </Button>
          </>
        )}

        {/* BACK TO LOGIN */}
        {!hasSubmitted && (
          <div className="mt-4 text-center text-[10px]">
            <span className="text-gray-600">
              Remember your password?{" "}
            </span>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="font-semibold text-[#6C3FF5] hover:underline"
            >
              Sign In
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default Forgotpassword;
