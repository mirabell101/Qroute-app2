
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getSupabaseClient } from "../../supabaseClient.ts";

const router = Router();

const resendOtpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return res.status(429).json({
      success: false,
      message:
        "Too many OTP resend requests. Please wait before trying again.",
    });
  },
});

router.post("/", resendOtpLimiter, async (req, res) => {
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
      console.error("Supabase OTP resend error:", error);

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
