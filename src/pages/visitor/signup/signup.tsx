import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

function SignUp() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4 py-4">
      {/* SIGN UP CARD */}
      <div className="w-full max-w-[580px] min-h-[695px] border border-[#333] rounded-[8px] px-[75px] py-[45px]">

        {/* HEADER */}
        <div className="text-center">
          <h1 className="text-[48px] font-bold leading-tight text-black">
            WELCOME
          </h1>

          <p className="mt-1 text-[21px] text-black">
            Sign in your Account
          </p>
        </div>

        {/* EMAIL */}
        <div className="mt-[84px]">
          <div className="relative">
            <Input
              type="email"
              placeholder="Enter your Email"
              className="
                h-[47px]
                rounded-full
                border-[#999]
                px-4
                text-[19px]
                shadow-[0_3px_4px_rgba(0,0,0,0.25)]
                placeholder:text-[#777]
                focus-visible:ring-1
              "
            />

            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 bg-white pr-2 text-[19px] text-black">
              Email:
            </span>

            <style>{`
              input[type="email"] {
                padding-left: 84px;
              }
            `}</style>
          </div>
        </div>

        {/* PASSWORD */}
        <div className="mt-[36px]">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your Password"
              className="
                h-[47px]
                rounded-full
                border-[#999]
                px-4
                pr-12
                text-[19px]
                shadow-[0_3px_4px_rgba(0,0,0,0.25)]
                placeholder:text-[#777]
                focus-visible:ring-1
              "
            />

            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 bg-white pr-2 text-[19px] text-black">
              Password:
            </span>

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-black"
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff size={20} />
              ) : (
                <Eye size={20} />
              )}
            </button>

            <style>{`
              input[type="password"],
              input[type="text"] {
                padding-left: 112px;
              }
            `}</style>
          </div>
        </div>

        {/* REMEMBER ME */}
        <div className="mt-[27px] flex items-center gap-3">
          <Checkbox
            id="remember"
            className="h-[18px] w-[18px] rounded-[4px]"
          />

          <label
            htmlFor="remember"
            className="cursor-pointer text-[16px] text-black"
          >
            Remember me
          </label>
        </div>

        {/* SIGN UP BUTTON */}
        <Button
          type="button"
          className="
            mt-[25px]
            h-[47px]
            w-full
            rounded-full
            bg-[#6255F5]
            text-[21px]
            font-normal
            text-white
            shadow-[0_3px_4px_rgba(0,0,0,0.25)]
            hover:bg-[#5548E8]
          "
        >
          Sign Up
        </Button>

        {/* TERMS AND CONDITIONS */}
        <div className="mt-[23px] flex items-center gap-3">
          <Checkbox
            id="terms"
            className="h-[18px] w-[18px] rounded-[4px]"
          />

          <label
            htmlFor="terms"
            className="cursor-pointer text-[16px] text-black"
          >
            I accept the Terms and Condition
          </label>
        </div>

        {/* SIGN IN */}
        <div className="mt-[54px] text-center text-[16px]">
          <span className="text-black">
            Already have an Account?{" "}
          </span>

          <button
            type="button"
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