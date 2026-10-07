import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import qrouteLogo from "@/assets/logoboi.png";

function Resetpassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const validatePassword = (value: string) => {
    if (!value) {
      return "Password is required.";
    }

    if (value.length < 8) {
      return "Password must be at least 8 characters.";
    }

    if (!/[A-Z]/.test(value)) {
      return "Password must contain at least one uppercase letter.";
    }

    if (!/[a-z]/.test(value)) {
      return "Password must contain at least one lowercase letter.";
    }

    if (!/[0-9]/.test(value)) {
      return "Password must contain at least one number.";
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-]/.test(value)) {
      return "Password must contain at least one special character.";
    }

    return "";
  };

  const validateConfirmPassword = (value: string) => {
    if (!value) {
      return "Please confirm your password.";
    }

    if (value !== password) {
      return "Passwords do not match.";
    }

    return "";
  };

  const handleResetPassword = () => {
  const passwordValidation = validatePassword(password);
  const confirmPasswordValidation =
    validateConfirmPassword(confirmPassword);

  setPasswordError(passwordValidation);
  setConfirmPasswordError(confirmPasswordValidation);

  if (passwordValidation || confirmPasswordValidation) {
    return;
  }

  const resetData = location.state as
    | {
        userId?: string;
        email?: string;
      }
    | null;

  if (!resetData?.userId) {
    navigate("/forgot-password", { replace: true });
    return;
  }

  const storedAccounts = localStorage.getItem("qroute_accounts");

  if (!storedAccounts) {
    setPasswordError("Unable to reset password. Please try again.");
    return;
  }

  try {
    const accounts = JSON.parse(storedAccounts);

    const updatedAccounts = accounts.map(
      (account: {
        id: string;
        email: string;
        password: string;
      }) =>
        account.id === resetData.userId
          ? {
              ...account,
              password,
            }
          : account
    );

    localStorage.setItem(
      "qroute_accounts",
      JSON.stringify(updatedAccounts)
    );

    navigate("/login", {
      replace: true,
      state: {
        passwordReset: true,
      },
    });
  } catch {
    setPasswordError("Unable to reset password. Please try again.");
  }
};

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-white px-4">
      {/* TOP-LEFT LOGO */}
      <img
        src={qrouteLogo}
        alt="Qroute"
        className="absolute left-15 top-10 h-auto w-[160px] object-contain"
      />

      {/* FORGOT PASSWORD CARD */}
      <div className="w-full max-w-[450px] rounded-[6px] border border-[#e1e1e1] bg-white px-10 py-7 shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
        {/* HEADER */}
        <div className="flex items-center justify-center">

          <div className="flex flex-col justify-center">
            <h1 className="text-[30px] font-bold leading-[1] tracking-[-0.5px] text-black ">
              Set a New Password
            </h1>

            <p className="mt-1  translate-x-10 text-[12px] leading-none text-black">
               Must meet all password requirements.
            </p>
          </div>
        </div>

        {/* PASSWORD */}
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
              placeholder="Enter your password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);

                if (passwordError) {
                  setPasswordError("");
                }

                if (confirmPassword && event.target.value === confirmPassword) {
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
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
              aria-label={
                showPassword ? "Hide password" : "Show password"
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
            <p className="mt-1 px-1 text-[10px] leading-tight text-red-500">
              {passwordError}
            </p>
          )}
        </div>

        {/* CONFIRM PASSWORD */}
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
              placeholder="Enter your password again"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);

                if (confirmPasswordError) {
                  setConfirmPasswordError("");
                }
              }}
              className={`h-9 rounded-[5px] border px-3 pr-10 text-[12px] shadow-none ${
                confirmPasswordError
                  ? "border-red-500 focus-visible:ring-red-500"
                  : "border-[#b8b8b8]"
              }`}
            />

            <button
              type="button"
              onClick={() =>
                setShowConfirmPassword(!showConfirmPassword)
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
            <p className="mt-1 px-1 text-[10px] leading-tight text-red-500">
              {confirmPasswordError}
            </p>
          )}
        </div>

        {/* RESET PASSWORD */}
        <Button
          type="button"
          onClick={handleResetPassword}
          className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
        >
          Reset Password
        </Button>

        {/* BACK TO LOGIN */}
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
      </div>
    </main>
  );
}

export default Resetpassword;