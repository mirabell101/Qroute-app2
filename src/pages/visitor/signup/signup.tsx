import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff,  User, Mail, Lock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

import qrouteLogo from "@/assets/logoboi.png";
import appLogo from "@/assets/APP VER (1).png";

interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
}

const ACCOUNTS_KEY = "qroute_accounts";

function getStoredAccounts(): Account[] {
  try {
    const stored = localStorage.getItem(ACCOUNTS_KEY);
    return stored ? (JSON.parse(stored) as Account[]) : [];
  } catch {
    return [];
  }
}

function SignUp() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [termsError, setTermsError] = useState("");

  const validateUsername = (value: string) => {
    if (!value.trim()) {
      return "Username is required.";
    }

    return "";
  };

  const validateEmail = (value: string) => {
    if (!value.trim()) {
      return "Email address is required.";
    }

    if (!/^[^\s@]+@gmail\.com$/i.test(value.trim())) {
      return "Please enter a valid Gmail address.";
    }

    return "";
  };

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

  const handleSignUp = () => {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    const usernameValidation = validateUsername(normalizedUsername);
    const emailValidation = validateEmail(normalizedEmail);
    const passwordValidation = validatePassword(password);
    const confirmPasswordValidation =
      validateConfirmPassword(confirmPassword);

    const termsValidation = termsAccepted
      ? ""
      : "You must accept the Terms and Conditions.";

    const accounts = getStoredAccounts();

    const existingAccount = accounts.some(
      (account) =>
        account.email.toLowerCase() === normalizedEmail
    );

    setUsernameError(usernameValidation);

    setEmailError(
      emailValidation ||
        (existingAccount
          ? "An account with this Gmail already exists."
          : "")
    );

    setPasswordError(passwordValidation);
    setConfirmPasswordError(confirmPasswordValidation);
    setTermsError(termsValidation);

    if (
      usernameValidation ||
      emailValidation ||
      passwordValidation ||
      confirmPasswordValidation ||
      termsValidation ||
      existingAccount
    ) {
      return;
    }

    const newAccount: Account = {
      id: crypto.randomUUID(),
      username: normalizedUsername,
      email: normalizedEmail,
      password,
    };

    const updatedAccounts = [...accounts, newAccount];

    try {
      localStorage.setItem(
        ACCOUNTS_KEY,
        JSON.stringify(updatedAccounts)
      );

      navigate("/login");
    } catch {
      setEmailError(
        "Unable to save your account. Please try again."
      );
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

      {/* SIGN UP CARD */}
      <div className="w-full max-w-[450px] rounded-[6px] border border-[#e1e1e1] bg-white px-10 py-6 shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
        {/* HEADER */}
        <div className="flex items-center justify-center">
          <img
            src={appLogo}
            alt="Qroute app logo"
            className="mr-2 h-[50px] w-[50px] shrink-0 object-contain"
          />

          <div className="flex flex-col justify-center">
            <h1 className="text-[31px] font-bold leading-[1] tracking-[-0.5px] text-black">
              WELCOME
            </h1>

            <p className="mt-1 translate-x-5 text-[12px] leading-none text-black">
              Create your Account
            </p>
          </div>
        </div>

        {/* USERNAME */}
        <div className="mt-5">
          <label
            htmlFor="username"
            className="text-[12px] font-medium text-black"
          >
            Username
          </label>

          <div className="relative mt-1.5">
  <User
    size={15}
    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
  />

  <Input
    id="username"
    type="text"
    placeholder="Enter your username"
    value={username}
    onChange={(e) => {
      setUsername(e.target.value);

      if (usernameError) {
        setUsernameError("");
      }
    }}
    className={`h-9 rounded-[5px] border pl-9 pr-3 text-[12px] shadow-none ${
      usernameError
        ? "border-red-500 focus-visible:ring-red-500"
        : "border-[#b8b8b8]"
    }`}
  />
</div>

          {usernameError && (
            <p className="mt-1 px-1 text-[10px] leading-none text-red-500">
              {usernameError}
            </p>
          )}
        </div>

        {/* EMAIL */}
        <div className="mt-3">
          <label
            htmlFor="email"
            className="text-[12px] font-medium text-black"
          >
            Email
          </label>

          <div className="relative mt-1.5">
  <Mail
    size={15}
    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
  />

  <Input
    id="email"
    type="email"
    placeholder="Enter your email"
    value={email}
    onChange={(e) => {
      setEmail(e.target.value);

      if (emailError) {
        setEmailError("");
      }
    }}
    className={`h-9 rounded-[5px] border pl-9 pr-3 text-[12px] shadow-none ${
      emailError
        ? "border-red-500 focus-visible:ring-red-500"
        : "border-[#b8b8b8]"
    }`}
  />
</div>

          {emailError && (
            <p className="mt-1 px-1 text-[10px] leading-none text-red-500">
              {emailError}
            </p>
          )}
        </div>

        {/* PASSWORD */}
        <div className="mt-3">
          <label
            htmlFor="password"
            className="text-[12px] font-medium text-black"
          >
            Password
          </label>

          <div className="relative mt-1.5">
            <Lock
    size={15}
    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
  />
            
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);

                if (passwordError) {
                  setPasswordError("");
                }

                if (confirmPasswordError) {
                  setConfirmPasswordError("");
                }
              }}
              className={`h-9 rounded-[5px] border pl-9 pr-10 text-[12px] shadow-none ${
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
            <p className="mt-1 px-1 text-[10px] leading-tight text-red-500">
              {passwordError}
            </p>
          )}
        </div>

        {/* CONFIRM PASSWORD */}
        <div className="mt-3">
          <label
            htmlFor="confirmPassword"
            className="text-[12px] font-medium text-black"
          >
            Confirm Password
          </label>

          <div className="relative mt-1.5">
            <Lock
  size={15}
  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
/>
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Enter your password again"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);

                if (confirmPasswordError) {
                  setConfirmPasswordError("");
                }
              }}
              className={`h-9 rounded-[5px] border pl-9 pr-10 text-[12px] shadow-none ${
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
                  ? "Hide confirm password"
                  : "Show confirm password"
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
            <p className="mt-1 px-1 text-[10px] leading-none text-red-500">
              {confirmPasswordError}
            </p>
          )}
        </div>

        {/* TERMS AND CONDITIONS */}
        <div className="mt-3">
          <div className="flex items-start gap-1.5">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => {
                setTermsAccepted(checked === true);

                if (checked === true) {
                  setTermsError("");
                }
              }}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[2px]"
            />

            <label
  htmlFor="terms"
  className="cursor-pointer text-[10px] leading-tight text-gray-700"
>
  I agree to the{" "}
  <a
    href="#"
    onClick={(e) => e.preventDefault()}
    className="font-medium text-[#6C3FF5] hover:underline"
  >
    Terms and Conditions
  </a>{" "}
  and acknowledge the{" "}
  <a
    href="#"
    onClick={(e) => e.preventDefault()}
    className="font-medium text-[#6C3FF5] hover:underline"
  >
    Privacy Policy
  </a>
  .
</label>
          </div>

          {termsError && (
            <p className="mt-1 px-1 text-[10px] leading-none text-red-500">
              {termsError}
            </p>
          )}
        </div>

        {/* SIGN UP */}
        <Button
          type="button"
          onClick={handleSignUp}
          className="mt-4 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
        >
          Sign Up
        </Button>

        {/* SIGN IN */}
        <div className="mt-4 text-center text-[10px]">
          <span className="text-gray-600">
            Already have an account?{" "}
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

export default SignUp;