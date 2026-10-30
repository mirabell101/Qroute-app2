
import { useEffect, useState } from "react";
import type { KeyboardEvent, ClipboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import qrouteLogo from "@/assets/logoboi.png";
import appLogo from "@/assets/APP VER (1).png";
import { API_BASE_URL } from "@/lib/api";

interface OTPRouteState {
  userId?: string;
  email?: string;
  mode?: "signup" | "forgot-password";
}

function OTP() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as OTPRouteState | null;
  const email = state?.email ?? "";
  const mode = state?.mode ?? "signup";

  const [otpInputs, setOtpInputs] = useState([
    "", "", "", "", "", "",
  ]);

  const [resendCooldown, setResendCooldown] = useState(30);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  // Require navigation state from the signup page.
  useEffect(() => {
    if (!email || mode !== "signup") {
      navigate("/signup", { replace: true });
    }
  }, [email, mode, navigate]);

  // Resend cooldown.
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((previous) =>
        Math.max(0, previous - 1)
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleOTPChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const updatedInputs = [...otpInputs];
    updatedInputs[index] = value;

    setOtpInputs(updatedInputs);
    setError("");
    setSuccess("");

    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handlePaste = (
    event: ClipboardEvent<HTMLInputElement>
  ) => {
    event.preventDefault();

    const pastedCode = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!pastedCode) return;

    const updatedInputs = ["", "", "", "", "", ""];

    pastedCode.split("").forEach((digit, index) => {
      updatedInputs[index] = digit;
    });

    setOtpInputs(updatedInputs);
    setError("");
    setSuccess("");

    const focusIndex = Math.min(pastedCode.length, 5);
    document.getElementById(`otp-${focusIndex}`)?.focus();
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      event.key === "Backspace" &&
      !otpInputs[index] &&
      index > 0
    ) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }

    if (event.key === "ArrowRight" && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleVerify = async () => {
    if (isVerifying || isResending || isVerified) return;

    const enteredOTP = otpInputs.join("");

    if (enteredOTP.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      setIsVerifying(true);

      const response = await fetch(
        `${API_BASE_URL}/api/auth/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            token: enteredOTP,
          }),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        setError(
          result?.message ||
            "Verification failed. Check the code and try again."
        );
        return;
      }

      setIsVerified(true);
      setSuccess(
        "Email verified successfully! Redirecting to sign in..."
      );

      window.setTimeout(() => {
        navigate("/login", {
          replace: true,
          state: {
            email,
            message:
              result.message ||
              "Your email has been verified. You can now sign in.",
          },
        });
      }, 900);
    } catch (requestError) {
      console.error("OTP verification request failed:", requestError);

      setError("Unable to connect to the server. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (
      isResending ||
      isVerifying ||
      isVerified ||
      resendCooldown > 0
    ) {
      return;
    }

    setError("");
    setSuccess("");

    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      setIsResending(true);

      const response = await fetch(
        `${API_BASE_URL}/api/auth/resend-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
          signal: controller.signal,
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        setError(
          result?.message ||
            "Unable to resend the verification code. Please try again later."
        );
        return;
      }

      setOtpInputs(["", "", "", "", "", ""]);
      setResendCooldown(30);
      setSuccess(
        "If your account can receive a new code, an email will be sent."
      );

      // Focus after React has rendered the cleared inputs.
      window.setTimeout(() => {
        document.getElementById("otp-0")?.focus();
      }, 0);
    } catch (requestError) {
      if (
        requestError instanceof Error &&
        requestError.name === "AbortError"
      ) {
        setError(
          "The request took too long. Check your connection and try again."
        );
      } else {
        console.error("OTP resend request failed:", requestError);
        setError("Unable to connect to the server. Please try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsResending(false);
    }
  };

  if (!email || mode !== "signup") {
    return null;
  }

  return (
    <main className="relative flex min-h-screen w-screen items-center justify-center overflow-x-hidden bg-white px-4 py-8">
      {/* TOP-LEFT LOGO */}
      <img
        src={qrouteLogo}
        alt="Qroute"
        className="absolute left-6 top-6 h-auto w-[130px] object-contain sm:left-15 sm:top-10 sm:w-[160px]"
      />

      {/* OTP CARD */}
      <div className="w-full max-w-[450px] rounded-[6px] border border-[#e1e1e1] bg-white px-6 py-7 shadow-[0_1px_6px_rgba(0,0,0,0.08)] sm:px-10">
        {/* HEADER */}
        <div className="flex items-center justify-center">
          <img
            src={appLogo}
            alt="Qroute app logo"
            className="mr-2 h-[50px] w-[50px] shrink-0 object-contain"
          />

          <div className="flex flex-col justify-center">
            <h1 className="text-[31px] font-bold leading-[1] tracking-[-0.5px] text-black">
              VERIFY
            </h1>

            <p className="mt-1 text-[12px] leading-none text-black">
              Verify your Account
            </p>
          </div>
        </div>

        {/* MESSAGE */}
        <div className="mt-6 text-center">
          <p className="text-[12px] text-gray-700">
            Enter the 6-digit verification code sent to
          </p>

          <p className="mt-1 break-all text-[12px] font-semibold text-black">
            {email}
          </p>
        </div>

        {/* OTP INPUTS */}
        <div className="mt-5 flex justify-center gap-2">
          {otpInputs.map((value, index) => (
            <input
              key={index}
              id={`otp-${index}`}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              aria-label={`Verification digit ${index + 1}`}
              value={value}
              disabled={isVerifying || isResending || isVerified}
              onChange={(event) =>
                handleOTPChange(index, event.target.value)
              }
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              className={`h-10 w-10 rounded-[5px] border text-center text-[15px] font-medium outline-none ${
                error
                  ? "border-red-500 focus:border-red-500"
                  : "border-[#b8b8b8] focus:border-[#6355F5]"
              }`}
            />
          ))}
        </div>

        {/* ERROR */}
        {error && (
          <p
            role="alert"
            className="mt-3 text-center text-[10px] leading-tight text-red-500"
          >
            {error}
          </p>
        )}

        {/* SUCCESS */}
        {success && (
          <p
            role="status"
            className="mt-3 text-center text-[10px] leading-tight text-green-600"
          >
            {success}
          </p>
        )}

        {/* VERIFY */}
        <Button
          type="button"
          onClick={handleVerify}
          disabled={
            isVerifying ||
            isResending ||
            isVerified ||
            otpInputs.join("").length !== 6
          }
          className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVerifying ? "Verifying..." : "Verify"}
        </Button>

        {/* RESEND */}
        <div className="mt-4 text-center text-[10px]">
          <span className="text-gray-600">
            Didn't receive the code?{" "}
          </span>

          <button
            type="button"
            onClick={handleResend}
            disabled={
              resendCooldown > 0 ||
              isResending ||
              isVerifying ||
              isVerified
            }
            className="font-semibold text-[#6C3FF5] hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
          >
            {isResending
              ? "Sending..."
              : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend OTP"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default OTP;
