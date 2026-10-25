
import { Router } from "express";
import { getSupabaseClient } from "../supabaseClient.ts";

const router = Router();

// Register a new account.
router.post("/register", async (req, res) => {
  try {
    const { username, displayName, email, password } = req.body ?? {};

    if (
      typeof username !== "string" ||
      typeof displayName !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !displayName.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    const normalizedUsername = username.trim();
    const normalizedDisplayName = displayName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(normalizedUsername)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must be 3–30 characters and contain only letters, numbers, or underscores.",
      });
    }

    if (
      password.length < 8 ||
      password.length > 128 ||
      normalizedEmail.length > 254 ||
      normalizedDisplayName.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more fields are invalid or exceed the allowed length.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          username: normalizedUsername,
          display_name: normalizedDisplayName,
        },
      },
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: data.session
        ? "Registration successful."
        : "Please check your email for the verification code.",
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
          }
        : null,
      requiresEmailVerification: !data.session,
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during registration.",
    });
  }
});

// Sign in using Supabase Auth.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      password.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.session || !data.user) {
      return res.status(401).json({
        success: false,
        message:
          "Unable to sign in. Check your credentials and make sure your email is verified.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username ?? null,
        displayName: data.user.user_metadata?.display_name ?? null,
      },
      session: data.session,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during login.",
    });
  }
});

// Verify a signup email OTP.
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, token } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof token !== "string" ||
      !email.trim() ||
      !/^\d{6}$/.test(token)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address and 6-digit code.",
      });
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "signup",
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message:
          "The verification code is invalid or expired. Please try again or request a new code.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. Please sign in.",
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email,
          }
        : null,
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred while verifying your email.",
    });
  }
});

// Request a new signup email OTP.
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message:
          "Unable to resend the verification code. Please try again later.",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "If the account can receive a new verification code, an email will be sent.",
    });
  } catch (error) {
    console.error("OTP resend error:", error);

    return res.status(500).json({
      success: false,
      message:
        "An unexpected error occurred while requesting a new code.",
    });
  }
});

export default router;
