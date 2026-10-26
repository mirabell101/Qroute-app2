
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getSupabaseClient } from "../../supabaseClient.ts";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resendResetOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/", resendResetOtpLimiter, async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      email.trim().length > 254 ||
      !EMAIL_REGEX.test(email.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase()
    );

    if (error) {
      console.error("Password recovery resend failed:", {
        code: error.code,
        message: error.message,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "If an account exists for that email, a new recovery email will be sent.",
    });
  } catch (error) {
    console.error("Password recovery resend failed.");

    return res.status(500).json({
      success: false,
      message: "Unable to resend the recovery code. Please try again later.",
    });
  }
});

export default router;
