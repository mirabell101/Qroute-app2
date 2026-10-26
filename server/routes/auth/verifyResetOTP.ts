
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getSupabaseClient } from "../../supabaseClient.ts";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const verifyResetOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/", verifyResetOtpLimiter, async (req, res) => {
  try {
    const { email, token } = req.body ?? {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      email.trim().length > 254 ||
      !EMAIL_REGEX.test(email.trim()) ||
      typeof token !== "string" ||
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
      type: "recovery",
    });

    if (error || !data.session || !data.user) {
      return res.status(400).json({
        success: false,
        message:
          "The recovery code is invalid or expired. Request a new code and try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Recovery code verified. You can now set a new password.",
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    console.error("Password recovery OTP verification failed.");

    return res.status(500).json({
      success: false,
      message: "Unable to verify the recovery code. Please try again.",
    });
  }
});

export default router;
