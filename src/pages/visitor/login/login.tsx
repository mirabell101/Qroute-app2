import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type LoginProps = {
  onSignUp: () => void;
};

function Login({ onSignUp }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {  
      if (event === "PASSWORD_RECOVERY") {
        setIsResettingPassword(true);
        setMessage("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    setIsError(false);

    if (isResettingPassword) {
      const { error } = await supabase.auth.updateUser({ password });
      setIsLoading(false);

      if (error) {
        setMessage(error.message);
        setIsError(true);
        return;
      }

      setIsResettingPassword(false);
      setPassword("");
      setMessage("Password updated. You can now sign in.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }

    setMessage("Signed in successfully.");
  }

  async function handleForgotPassword() {
    setMessage("");
    setIsError(false);

    if (!email.trim()) {
      setMessage("Enter your email address first.");
      setIsError(true);
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }

    setMessage("If an account exists for that email, a password reset link is on its way.");
  }

  async function handleGoogleSignIn() {
    setMessage("");
    setIsError(false);
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    // If signInWithOAuth returns an error, it means the redirect could not
    // even be initiated (e.g. network failure or misconfigured provider).
    // When the redirect succeeds, the browser navigates away before this
    // callback runs, so any post-redirect errors are handled by the
    // AuthCallback component.
    if (error) {
      setIsLoading(false);
      setMessage(error.message);
      setIsError(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-[420px] rounded-[6px] border border-[#333] px-10 py-9">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-black">
            {isResettingPassword ? "RESET PASSWORD" : "WELCOME"}
          </h1>
          <p className="mt-1 text-[16px] text-black">
            {isResettingPassword
              ? "Choose a new password"
              : "Sign in to your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mt-8">
            <label htmlFor="email" className="text-sm font-medium text-black">
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isLoading || isResettingPassword}
              className="mt-2 h-12 rounded-full border-[#999] px-5"
            />
          </div>

          <div className="mt-5">
            <label htmlFor="password" className="text-sm font-medium text-black">
              {isResettingPassword ? "New Password" : "Password"}
            </label>
            <div className="relative mt-2">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isResettingPassword ? "new-password" : "current-password"}
                placeholder={isResettingPassword ? "Enter a new password" : "Enter your password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={isLoading}
                className="h-12 rounded-full border-[#999] px-5 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </div>

          {message && (
            <p
              className={`mt-4 text-sm ${isError ? "text-red-600" : "text-green-700"}`}
              role={isError ? "alert" : "status"}
            >
              {message}
            </p>
          )}

          {!isResettingPassword && (
            <div className="mt-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="remember" />
                <label htmlFor="remember" className="cursor-pointer text-sm text-gray-700">
                  Remember me
                </label>
              </div>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="text-sm font-medium text-[#6C3FF5] hover:underline disabled:opacity-50"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="mt-7 h-12 w-full rounded-full bg-[#6C3FF5] text-white hover:bg-[#5B32D6]"
          >
            {isLoading
              ? "Please wait..."
              : isResettingPassword
                ? "Update Password"
                : "Sign In"}
          </Button>
        </form>

        {!isResettingPassword && (
          <>
            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-gray-300" />
              <span className="text-sm text-gray-500">or</span>
              <div className="h-px flex-1 bg-gray-300" />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={handleGoogleSignIn}
              className="h-12 w-full rounded-full border-gray-300 bg-white text-black hover:bg-gray-50"
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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

            <div className="mt-7 text-center text-sm">
              <span className="text-gray-600">Don&apos;t have an account? </span>
              <button
                type="button"
                onClick={onSignUp}
                className="font-semibold text-[#6C3FF5] hover:underline"
              >
                Sign Up
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default Login;
