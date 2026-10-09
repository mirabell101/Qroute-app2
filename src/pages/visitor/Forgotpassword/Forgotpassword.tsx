import { useState } from "react";

import { useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";

import qrouteLogo from "@/assets/logoboi.png";



function Forgotpassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");

  const [emailError, setEmailError] = useState("");

  const validateEmail = (value: string) => {
    if (!value.trim()) {
      return "Email address is required.";
    }

    if (!/^[^\s@]+@gmail\.com$/i.test(value.trim())) {
      return "Please enter a valid Gmail address.";
    }

    return "";
  };

  const handleContinue = () => {
  const emailValidation = validateEmail(email);

  setEmailError(emailValidation);

  if (emailValidation) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const storedAccounts = localStorage.getItem("qroute_accounts");

  if (!storedAccounts) {
    setEmailError("No account found with this Gmail address.");
    return;
  }

  try {
    const accounts = JSON.parse(storedAccounts);

    const account = accounts.find(
      (storedAccount: {
        id: string;
        email: string;
        password: string;
      }) => storedAccount.email.toLowerCase() === normalizedEmail
    );

    if (!account) {
      setEmailError("No account found with this Gmail address.");
      return;
    }

    navigate("/otp", {
      state: {
        userId: account.id,
        email: normalizedEmail,
        mode: "forgot-password",
      },
    });
  } catch {
    setEmailError("Unable to process your request. Please try again.");
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
            <h1 className="text-[30px] font-bold leading-[1] tracking-[-0.5px] text-black">
              Forgot Password
            </h1>

            <p className="mt-1 translate-x-10 text-[12px] leading-none text-black">
              Enter your registered Gmail.
            </p>
          </div>
        </div>

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
              placeholder="Enter your Gmail address"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);

                if (emailError) {
                  setEmailError("");
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
            <p className="mt-1 px-1 text-[10px] leading-tight text-red-500">
              {emailError}
            </p>
          )}
        </div>

        {/* CONTINUE */}

        <Button
          type="button"
          onClick={handleContinue}
          className="mt-5 h-9 w-full rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
        >
          Continue
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

export default Forgotpassword;