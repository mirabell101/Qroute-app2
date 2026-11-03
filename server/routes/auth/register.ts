
import { Router } from "express";
import { getSupabaseClient } from "../../supabaseClient.ts";

const router = Router();

router.post("/", async (req, res) => {
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

export default router;
