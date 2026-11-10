
import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { getSupabaseClient } from "../../supabaseClient.ts";
import { getRecoveryRedirectOrigin } from "../../origins.ts";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const forgotPasswordLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      success: false,
      code: "RECOVERY_RATE_LIMITED",
      message: "Too many password recovery requests. Please wait before trying again.",
      retryAfterSeconds,
    });
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSafeErrorDetails(
  error: unknown,
): { status?: number; code?: string } {
  if (!isRecord(error)) {
    return {};
  }

  const status =
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 100 &&
    error.status <= 599
      ? error.status
      : undefined;
  const code =
    typeof error.code === "string" && /^[a-z0-9_]+$/i.test(error.code)
      ? error.code
      : undefined;

  return {
    ...(status === undefined ? {} : { status }),
    ...(code === undefined ? {} : { code }),
  };
}

function logPasswordRecoveryFailure(error: unknown): void {
  console.error(
    "[auth] Password recovery request failed.",
    getSafeErrorDetails(error),
  );
}

function respondToSupabaseRateLimit(
  res: Response,
  error: unknown,
): boolean {
  if (!isRecord(error) || error.status !== 429) {
    return false;
  }

  const code =
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit"
      ? error.code
      : "SUPABASE_RATE_LIMITED";

  console.warn("[auth] Supabase rate-limited a password recovery request.", {
    status: error.status,
    code,
  });

  res.status(429).json({
    success: false,
    code,
    message:
      "Password recovery requests are temporarily limited. Please wait before trying again.",
  });
  return true;
}

router.post("/", forgotPasswordLimiter, async (req, res) => {
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

    const redirectOrigin = getRecoveryRedirectOrigin(req.get("Origin"));
    if (!redirectOrigin) {
      console.warn("[auth] Password recovery has no trusted redirect origin.", {
        status: 400,
        code: "RECOVERY_ORIGIN_UNAVAILABLE",
        originProvided: req.get("Origin") !== undefined,
      });
      return res.status(400).json({
        success: false,
        message: "Unable to process your request. Please try again later.",
      });
    }
    const redirectTo = new URL("/resetpassword", redirectOrigin).toString();

    const supabase = getSupabaseClient();

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo },
    );

    if (error) {
      if (respondToSupabaseRateLimit(res, error)) {
        return;
      }

      logPasswordRecoveryFailure(error);
      return res.status(502).json({
        success: false,
        message: "Unable to process your request. Please try again later.",
      });
    }

    // Keep the response generic to reduce account enumeration.
    return res.status(200).json({
      success: true,
      message:
        "If an account exists for that email, a password-reset link will be sent.",
    });
  } catch (error) {
    if (respondToSupabaseRateLimit(res, error)) {
      return;
    }

    logPasswordRecoveryFailure(error);

    return res.status(500).json({
      success: false,
      message: "Unable to process your request. Please try again later.",
    });
  }
});

export default router;
