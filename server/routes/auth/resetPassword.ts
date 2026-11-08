
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import requireAuth from "../../middleware/requireAuth.ts";
import { isStrongAccountPassword } from "../../account.ts";
import {
  SupabaseUserUpdateError,
  updateSupabaseUserPassword,
} from "../../supabaseClient.ts";

const router = Router();

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

router.post("/", resetPasswordLimiter, requireAuth, async (req, res) => {
  try {
    if (
      !isRecord(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.password !== "string" ||
      !isStrongAccountPassword(req.body.password)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a password that meets all requirements.",
      });
    }

    const accessToken = res.locals.accessToken;
    if (typeof accessToken !== "string" || !accessToken) {
      return res.status(401).json({
        success: false,
        message:
          "Your recovery session is invalid or expired. Please request a new recovery link.",
      });
    }

    try {
      await updateSupabaseUserPassword(accessToken, req.body.password);
    } catch (error) {
      if (error instanceof SupabaseUserUpdateError && error.status === 401) {
        return res.status(401).json({
          success: false,
          message:
            "Your recovery session is invalid or expired. Please request a new recovery link.",
        });
      }
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully. Please sign in.",
    });
  } catch (error) {
    console.error("Password update failed.");

    return res.status(502).json({
      success: false,
      message:
        "Unable to update your password. Please try again.",
    });
  }
});

export default router;
