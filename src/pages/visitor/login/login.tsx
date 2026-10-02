import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

function Login() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[420px] border border-[#333] rounded-[6px] px-10 py-9">

        {/* HEADER */}
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-black">
            WELCOME
          </h1>

          <p className="mt-1 text-[16px] text-black">
            Sign in your Account
          </p>
        </div>

        {/* EMAIL */}
        <div className="mt-8">
          <label
            htmlFor="email"
            className="text-sm font-medium text-black"
          >
            Email Address
          </label>

          <Input
            id="email"
            type="email"
            placeholder="Enter your email address"
            className="mt-2 h-12 rounded-full border-[#999] px-5"
          />
        </div>

        {/* PASSWORD */}
        <div className="mt-5">
          <label
            htmlFor="password"
            className="text-sm font-medium text-black"
          >
            Password
          </label>

          <div className="relative mt-2">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              className="h-12 rounded-full border-[#999] px-5 pr-12"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-black"
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>
          </div>
        </div>

        {/* REMEMBER ME + FORGOT PASSWORD */}
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="remember" />

            <label
              htmlFor="remember"
              className="text-sm text-gray-700 cursor-pointer"
            >
              Remember me
            </label>
          </div>

          <button
            type="button"
            className="text-sm font-medium text-[#6C3FF5] hover:underline"
          >
            Forgot Password?
          </button>
        </div>

        {/* SIGN IN */}
        <Button
          type="button"
          className="mt-7 h-12 w-full rounded-full bg-[#6C3FF5] text-white hover:bg-[#5B32D6]"
        >
          Sign In
        </Button>

        {/* DIVIDER */}
        <div className="my-7 flex items-center gap-4">
          <div className="h-px flex-1 bg-gray-300" />

          <span className="text-sm text-gray-500">
            or
          </span>

          <div className="h-px flex-1 bg-gray-300" />
        </div>

        {/* GOOGLE */}
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full rounded-full border-gray-300 bg-white text-black hover:bg-gray-50"
        >
          <span className="mr-2 text-lg font-bold">
            G
          </span>

          Continue with Google
        </Button>

        {/* SIGN UP */}
        <div className="mt-7 text-center text-sm">
          <span className="text-gray-600">
            Don&apos;t have an account?{" "}
          </span>

          <button
            type="button"
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