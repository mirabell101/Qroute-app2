
import { Router } from "express";
import { getSupabaseClient } from "../../supabaseClient.ts";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/", async (req, res) => {
  try {
    const { email, token } = req.body ?? {};

    // Validate the email and six-digit verification code.
    if (
      typeof email !== "string" ||
      typeof token !== "string" ||
      !email.trim() ||
      email.trim().length > 254 ||
      !EMAIL_REGEX.test(email.trim()) ||
      !/^\d{6}$/.test(token)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address and 6-digit code.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabase = getSupabaseClient();

    // Verify the signup OTP through Supabase Auth.
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type: "signup",
    });

    if (error) {
      console.error("Supabase OTP verification error:", error);

      return res.status(400).json({
        success: false,
        message:
          "The verification code is invalid or expired. Please try again or request a new code.",
      });
    }

    // Verification succeeded.
    // The user can now proceed to the login page.
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
      message:
        "An unexpected error occurred while verifying your email.",
    });
  }
});

export default router;
