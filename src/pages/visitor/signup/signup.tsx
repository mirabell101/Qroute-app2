import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type SignUpProps = {
  onSignIn: () => void;
};

function SignUp({ onSignIn }: SignUpProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (!termsAccepted) {
      setMessage("Please accept the Terms and Conditions to continue.");
      setIsError(true);
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }

    setMessage(
      data.session
        ? "Your account has been created."
        : "Check your email to confirm your account.",
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-4">
      <div className="w-full max-w-[580px] rounded-[8px] border border-[#333] px-8 py-10 sm:px-[75px] sm:py-[45px]">
        <div className="text-center">
          <h1 className="text-[40px] font-bold leading-tight text-black sm:text-[48px]">
            WELCOME
          </h1>
          <p className="mt-1 text-[19px] text-black sm:text-[21px]">
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mt-12 relative sm:mt-[84px]">
            <label
              htmlFor="signup-email"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 bg-white pr-2 text-[17px] text-black sm:text-[19px]"
            >
              Email:
            </label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="Enter your Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isLoading}
              className="h-[47px] rounded-full border-[#999] pl-[84px] text-[17px] shadow-[0_3px_4px_rgba(0,0,0,0.25)] placeholder:text-[#777] focus-visible:ring-1 sm:text-[19px]"
            />
          </div>

          <div className="relative mt-7 sm:mt-[36px]">
            <label
              htmlFor="signup-password"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 bg-white pr-2 text-[17px] text-black sm:text-[19px]"
            >
              Password:
            </label>
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Enter your Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={isLoading}
              className="h-[47px] rounded-full border-[#999] py-1 pl-[112px] pr-12 text-[17px] shadow-[0_3px_4px_rgba(0,0,0,0.25)] placeholder:text-[#777] focus-visible:ring-1 sm:text-[19px]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-black"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="mt-7 flex items-center gap-3">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              className="h-[18px] w-[18px] rounded-[4px]"
            />
            <label htmlFor="terms" className="cursor-pointer text-[16px] text-black">
              I accept the Terms and Conditions
            </label>
          </div>

          {message && (
            <p
              className={`mt-4 text-sm ${isError ? "text-red-600" : "text-green-700"}`}
              role={isError ? "alert" : "status"}
            >
              {message}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="mt-6 h-[47px] w-full rounded-full bg-[#6255F5] text-[21px] font-normal text-white shadow-[0_3px_4px_rgba(0,0,0,0.25)] hover:bg-[#5548E8]"
          >
            {isLoading ? "Please wait..." : "Sign Up"}
          </Button>
        </form>

        <div className="mt-10 text-center text-[16px] sm:mt-[54px]">
          <span className="text-black">Already have an account? </span>
          <button
            type="button"
            onClick={onSignIn}
            className="text-[#6255F5] underline underline-offset-2"
          >
            Sign In
          </button>
        </div>
      </div>
    </main>
  );
}

export default SignUp;
