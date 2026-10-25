
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

import qrouteLogo from "@/assets/logoboi.png";
import appLogo from "@/assets/APP VER (1).png";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Use the same Supabase project as the Express backend.
const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

function Login() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (value: string) => {
    if (!value.trim()) {
      return "Email address is required.";
    }

    // Match the backend's email validation.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return "Please enter a valid email address.";
    }

    return "";
  };

  const validatePassword = (value: string) => {
    if (!value) {
      return "Password is required.";
    }

    return "";
  };

  const handleLogin = async () => {
    if (isSubmitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    const emailValidation = validateEmail(normalizedEmail);
    const passwordValidation = validatePassword(password);

    setEmailError(emailValidation);
    setPasswordError(passwordValidation);
    setLoginError("");

    if (emailValidation || passwordValidation) return;

    if (!supabase) {
      setLoginError(
        "Supabase is not configured. Check your frontend environment variables."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setLoginError(
          result.message || "Unable to sign in. Please check your credentials."
        );
        return;
      }

      if (
        !result.session?.access_token ||
        !result.session?.refresh_token
      ) {
        setLoginError(
          "Login succeeded, but the authentication session was not returned."
        );
        return;
      }

      // Establish the Supabase session in the frontend SDK.
      // Supabase SDK manages session persistence and token refresh.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });

      if (sessionError) {
        setLoginError(
          "Your login was accepted, but your session could not be established."
        );
        return;
      }

      // Navigate only after the frontend session has been established.
      navigate("/home", {
        replace: true,
        state: {
          user: result.user,
          rememberMe,
        },
      });
    } catch (error) {
      console.error("Login request failed:", error);
      setLoginError(
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setIsSubmitting(false);
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

        {/* EMAIL */}
        <div className="mt-6">
          <label
            htmlFor="email"
            className="text-[12px] font-medium text-black"
          >
            Email
          </label>

          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError("");
              setLoginError("");
            }}
            className={`mt-1.5 h-9 rounded-[5px] border px-3 text-[12px] shadow-none ${
              emailError
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-[#b8b8b8]"
            }`}
          />

          {emailError && (
            <p className="mt-1 px-1 text-[10px] leading-none text-red-500">
              {emailError}
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
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
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
            onClick={() => navigate("/forgot-password")}
            className="text-[10px] font-medium text-[#6C3FF5] hover:underline"
          >
            Forgot Password
          </button>
        </div>

        {/* LOGIN ERROR */}
        {loginError && (
          <p
            role="alert"
            className="mt-3 text-center text-[11px] text-red-500"
          >
            {loginError}
          </p>
        )}

        {/* SIGN IN */}
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={() => void handleLogin()}
          className="mt-4 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
        >
          {isSubmitting ? "Signing In..." : "Sign In"}
        </Button>

        {/* DIVIDER */}
        <div className="my-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-300" />
          <span className="text-[9px] text-gray-500">or</span>
          <div className="h-px flex-1 bg-gray-300" />
        </div>

        {/* GOOGLE */}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLoginError(
              "Google sign-in has not been configured yet."
            );
          }}
          className="h-9 w-full rounded-[6px] border-gray-300 bg-white text-[10px] font-medium text-black shadow-none hover:bg-gray-50"
        >
          <span className="mr-1.5 text-[13px] font-bold">G</span>
          Sign in with Google
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
