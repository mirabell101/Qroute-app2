import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import qrouteLogo from "@/assets/logoboi.png";
import appLogo from "@/assets/APP VER (1).png";

interface OTPState {
  userId: string;
  email: string;
  mode: "signup" | "forgot-password";
  otp: string;
  expiresAt: number;
}

const OTP_STORAGE_KEY = "qroute_otp";

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function OTP() {
  const navigate = useNavigate();
  const location = useLocation();

  const [otpInputs, setOtpInputs] = useState([
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  const [otpData, setOtpData] = useState<OTPState | null>(null);
  const [timeLeft, setTimeLeft] = useState(180);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const state = location.state as
      | {
          userId?: string;
          email?: string;
          mode?: "signup" | "forgot-password";
        }
      | null;

    const storedOTP = sessionStorage.getItem(OTP_STORAGE_KEY);

    if (storedOTP) {
      try {
        const parsedOTP = JSON.parse(storedOTP) as OTPState;

        if (parsedOTP.expiresAt > Date.now()) {
          setOtpData(parsedOTP);
          setTimeLeft(
            Math.max(
              0,
              Math.ceil((parsedOTP.expiresAt - Date.now()) / 1000)
            )
          );
          return;
        }

        sessionStorage.removeItem(OTP_STORAGE_KEY);
      } catch {
        sessionStorage.removeItem(OTP_STORAGE_KEY);
      }
    }

    if (!state?.userId || !state?.email || !state?.mode) {
      navigate("/signup", { replace: true });
      return;
    }

    const newOTP: OTPState = {
      userId: state.userId,
      email: state.email,
      mode: state.mode,
      otp: generateOTP(),
      expiresAt: Date.now() + 180000,
    };

    sessionStorage.setItem(
      OTP_STORAGE_KEY,
      JSON.stringify(newOTP)
    );

    setOtpData(newOTP);
    setTimeLeft(180);

    // FRONTEND TEST ONLY
    console.log("QRoute OTP:", newOTP.otp);
  }, [location.state, navigate]);

  useEffect(() => {
  if (!otpData) return;

  const timer = setInterval(() => {
    const remaining = Math.max(
      0,
      Math.ceil((otpData.expiresAt - Date.now()) / 1000)
    );

    setTimeLeft(remaining);

    if (remaining <= 0) {
      clearInterval(timer);
    }
  }, 1000);

  return () => clearInterval(timer);
}, [otpData]);

useEffect(() => {
  if (resendCooldown <= 0) return;

  const timer = setInterval(() => {
    setResendCooldown((previous) => Math.max(0, previous - 1));
  }, 1000);

  return () => clearInterval(timer);
}, [resendCooldown]);

  const handleOTPChange = (
    index: number,
    value: string
  ) => {
    if (!/^\d?$/.test(value)) return;

    const updatedInputs = [...otpInputs];
    updatedInputs[index] = value;

    setOtpInputs(updatedInputs);
    setError("");

    if (value && index < 5) {
      const nextInput = document.getElementById(
        `otp-${index + 1}`
      );

      nextInput?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      event.key === "Backspace" &&
      !otpInputs[index] &&
      index > 0
    ) {
      const previousInput = document.getElementById(
        `otp-${index - 1}`
      );

      previousInput?.focus();
    }
  };

  const handleVerify = () => {
    if (!otpData) return;

    if (timeLeft <= 0) {
      setError("Your OTP has expired. Please request a new one.");
      return;
    }

    const enteredOTP = otpInputs.join("");

    if (enteredOTP.length !== 6) {
      setError("Please enter the complete 6-digit OTP.");
      return;
    }

    if (enteredOTP !== otpData.otp) {
      setError("Invalid OTP. Please try again.");
      return;
    }

    if (otpData.mode === "signup") {
      localStorage.setItem(
        "qroute_current_user",
        otpData.userId
      );
    }

    sessionStorage.removeItem(OTP_STORAGE_KEY);

    setError("");
    setSuccess("Verification successful!");

    setTimeout(() => {
      if (otpData.mode === "signup") {
        window.location.href = "/home";
      } else {
  navigate("/reset-password", {
    replace: true,
    state: {
      userId: otpData.userId,
      email: otpData.email,
    },
  });
}
    }, 700);
  };

  const handleResend = () => {
    if (!otpData) return;

    const newOTP: OTPState = {
      ...otpData,
      otp: generateOTP(),
      expiresAt: Date.now() + 180000,
    };

    sessionStorage.setItem(
      OTP_STORAGE_KEY,
      JSON.stringify(newOTP)
    );

    setOtpData(newOTP);
    setOtpInputs(["", "", "", "", "", ""]);
    setTimeLeft(180);
    setResendCooldown(30);
    setError("");
    setSuccess("");

    console.log("QRoute OTP:", newOTP.otp);
  };

  const formatTime = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return `${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  if (!otpData) {
    return null;
  }

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-white px-4">
      {/* TOP-LEFT LOGO */}
      <img
        src={qrouteLogo}
        alt="Qroute"
        className="absolute left-15 top-10 h-auto w-[160px] object-contain"
      />

      {/* OTP CARD */}
      <div className="w-full max-w-[450px] rounded-[6px] border border-[#e1e1e1] bg-white px-10 py-7 shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
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

          <p className="mt-1 text-[12px] font-semibold text-black">
            {otpData.email}
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
              maxLength={1}
              value={value}
              onChange={(event) =>
                handleOTPChange(index, event.target.value)
              }
              onKeyDown={(event) =>
                handleKeyDown(index, event)
              }
              className={`h-10 w-10 rounded-[5px] border text-center text-[15px] font-medium outline-none ${
                error
                  ? "border-red-500 focus:border-red-500"
                  : "border-[#b8b8b8] focus:border-[#6355F5]"
              }`}
            />
          ))}
        </div>

        {/* TIMER */}
        <div className="mt-4 text-center">
          {timeLeft > 0 ? (
            <p className="text-[11px] text-gray-500">
              Code expires in{" "}
              <span className="font-semibold text-[#6355F5]">
                {formatTime()}
              </span>
            </p>
          ) : (
            <p className="text-[11px] font-medium text-red-500">
              OTP expired
            </p>
          )}
        </div>

        {/* ERROR */}
        {error && (
          <p className="mt-3 text-center text-[10px] leading-tight text-red-500">
            {error}
          </p>
        )}

        {/* SUCCESS */}
        {success && (
          <p className="mt-3 text-center text-[10px] leading-tight text-green-600">
            {success}
          </p>
        )}

        {/* VERIFY */}
        <Button
          type="button"
          onClick={handleVerify}
          disabled={timeLeft <= 0 || !!success}
          className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verify
        </Button>

        {/* RESEND */}
        <div className="mt-4 text-center text-[10px]">
  <span className="text-gray-600">
    Didn't receive the code?{" "}
  </span>

  <button
    type="button"
    onClick={handleResend}
    disabled={resendCooldown > 0}
    className="font-semibold text-[#6C3FF5] hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
  >
    {resendCooldown > 0
      ? `Resend in ${resendCooldown}s`
      : "Resend OTP"}
  </button>
</div>
      </div>
    </main>
  );
}

export default OTP;