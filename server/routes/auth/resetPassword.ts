
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getSupabaseClient } from "../../supabaseClient.ts";

const router = Router();

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*(),.?":{}|<>_\-\\]/.test(password)
  );
}

router.post("/", resetPasswordLimiter, async (req, res) => {
  try {
    const { access_token, refresh_token, password } = req.body ?? {};

    if (
      typeof access_token !== "string" ||
      !access_token ||
      typeof refresh_token !== "string" ||
      !refresh_token ||
      typeof password !== "string" ||
      !isStrongPassword(password)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide a valid recovery session and a password that meets all requirements.",
      });
    }

    const supabase = getSupabaseClient();

    // Supabase must validate the recovery session.
    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

    if (sessionError || !sessionData.session || !sessionData.user) {
      return res.status(401).json({
        success: false,
        message:
          "Your recovery session is invalid or expired. Please request a new recovery code.",
      });
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      console.error("Password update failed:", {
        code: updateError.code,
        message: updateError.message,
      });

      return res.status(400).json({
        success: false,
        message:
          "Unable to update your password. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully. Please sign in.",
    });
  } catch (error) {
    console.error("Password reset failed.");

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred. Please try again.",
    });
  }
});

export default router;
