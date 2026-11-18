
import { Router } from "express";
import { createHmac } from "node:crypto";

import {
  getSupabaseClient,
  getSupabaseAdminClient,
} from "../../supabaseClient.ts";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Preserve the existing login-compatible username format.
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{1,30}$/;

function createIpKey(ipAddress: string): string {
  const secret = process.env.LOGIN_ATTEMPT_HMAC_SECRET;

  if (!secret) {
    throw new Error("Missing LOGIN_ATTEMPT_HMAC_SECRET");
  }

  return createHmac("sha256", secret)
    .update(ipAddress)
    .digest("hex");
}

function sendLockoutResponse(
  res: any,
  scope: "account" | "ip",
  lockedUntil: string,
) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(
      (new Date(lockedUntil).getTime() - Date.now()) / 1000,
    ),
  );

  const isAccountLock = scope === "account";

  return res.status(429).json({
    success: false,
    code: isAccountLock ? "ACCOUNT_LOCKED" : "IP_BLOCKED",
    scope,
    lockedUntil,
    retryAfterSeconds,
    message: isAccountLock
      ? "Too many incorrect password attempts. Please wait before trying again."
      : "Too many failed login attempts from this network. Please try again later.",
  });
}

router.post("/", async (req, res) => {
  try {
    const { identifier, email, password } = req.body ?? {};

    // Support both the current "identifier" field
    // and the older "email" field.
    const loginIdentifier = identifier ?? email;

    if (
      typeof loginIdentifier !== "string" ||
      typeof password !== "string" ||
      !loginIdentifier.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email or username and password are required.",
      });
    }

    const normalizedIdentifier = loginIdentifier.trim();

    if (
      password.length > 128 ||
      normalizedIdentifier.length > 254
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email/username or password.",
      });
    }

    const isEmail = normalizedIdentifier.includes("@");

    if (isEmail && !EMAIL_REGEX.test(normalizedIdentifier)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address or username.",
      });
    }

    if (!isEmail && !USERNAME_REGEX.test(normalizedIdentifier)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address or username.",
      });
    }

    // Generate a one-way HMAC key from the client's IP.
    // Never store the raw IP address in the database.
    const ipAddress = req.ip || req.socket.remoteAddress;

    if (!ipAddress) {
      console.error("Unable to determine login request IP address.");

      return res.status(500).json({
        success: false,
        message: "Unable to sign in right now. Please try again.",
      });
    }

    const ipKey = createIpKey(ipAddress);

    const adminSupabase = getSupabaseAdminClient();

    // Resolve both email and username through the protected RPC.
    const { data: accounts, error: accountLookupError } =
      await adminSupabase.rpc("resolve_login_account", {
        p_identifier: normalizedIdentifier,
      });

    if (accountLookupError) {
      console.error(
        "Login account resolution error:",
        accountLookupError,
      );

      return res.status(500).json({
        success: false,
        message: "Unable to sign in right now. Please try again.",
      });
    }

    const account =
      Array.isArray(accounts) && accounts.length === 1
        ? accounts[0]
        : null;

    // Only use an account ID for a valid, non-deleted account.
    const protectionUserId =
      account && account.is_deleted !== true
        ? account.user_id
        : null;

    // Check account and IP restrictions BEFORE password authentication.
    const { data: protection, error: protectionError } =
      await adminSupabase.rpc("check_login_protection", {
        p_user_id: protectionUserId,
        p_ip_key: ipKey,
      });

    if (protectionError) {
      console.error(
        "Login protection check error:",
        protectionError,
      );

      return res.status(500).json({
        success: false,
        message: "Unable to sign in right now. Please try again.",
      });
    }

    if (protection?.blocked === true) {
      const scope =
        protection.scope === "account" ? "account" : "ip";

      return sendLockoutResponse(
        res,
        scope,
        protection.lockedUntil,
      );
    }

    // Record a failed attempt. Passing null for the user ID
    // still updates the IP counter for unknown/deleted accounts.
    const recordFailedAttempt = async (userId: string | null) => {
      const { data, error } = await adminSupabase.rpc(
        "record_login_failure",
        {
          p_user_id: userId,
          p_ip_key: ipKey,
        },
      );

      if (error) {
        console.error("Recording login failure error:", error);
        throw new Error("Unable to record login failure.");
      }

      return data;
    };

    // Unknown account: count the attempt against the IP.
    if (!account || !account.email) {
      const failure = await recordFailedAttempt(null);

      if (failure?.accountLockedUntil) {
        return sendLockoutResponse(
          res,
          "account",
          failure.accountLockedUntil,
        );
      }

      if (failure?.ipBlockedUntil) {
        return sendLockoutResponse(
          res,
          "ip",
          failure.ipBlockedUntil,
        );
      }

      return res.status(401).json({
        success: false,
        message:
          "Unable to sign in. Check your credentials and try again.",
      });
    }

    // Deleted accounts must never authenticate.
    if (account.is_deleted === true) {
      await recordFailedAttempt(null);

      return res.status(401).json({
        success: false,
        message:
          "Unable to sign in. Check your credentials and try again.",
      });
    }

    // Authenticate using the resolved email and submitted password.
    const supabase = getSupabaseClient();

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: account.email,
        password,
      });

    // Preserve existing email-verification behavior.
    // An unverified email is not treated as an incorrect password.
    if (error?.code === "email_not_confirmed") {
      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        requiresEmailVerification: true,
        email: account.email,
        message:
          "Please verify your email address to continue.",
      });
    }

    // Incorrect password or other authentication failure.
    if (error || !data.session || !data.user) {
      const failure = await recordFailedAttempt(
        account.user_id,
      );

      // Immediately report the lockout when the threshold is reached.
      if (failure?.accountLockedUntil) {
        return sendLockoutResponse(
          res,
          "account",
          failure.accountLockedUntil,
        );
      }

      if (failure?.ipBlockedUntil) {
        return sendLockoutResponse(
          res,
          "ip",
          failure.ipBlockedUntil,
        );
      }

      return res.status(401).json({
        success: false,
        message:
          "Unable to sign in. Check your credentials and try again.",
      });
    }

    // Successful authentication: reset the account's failed attempts.
    const { error: resetError } = await adminSupabase.rpc(
      "reset_login_attempts",
      {
        p_user_id: account.user_id,
      },
    );

    if (resetError) {
      console.error(
        "Reset login attempts error:",
        resetError,
      );

      return res.status(500).json({
        success: false,
        message: "Unable to complete sign in right now. Please try again.",
      });
    }

    // Successful login.
    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username ?? null,
        displayName:
          data.user.user_metadata?.display_name ?? null,
      },
      session: data.session,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message:
        "An unexpected error occurred during login.",
    });
  }
});

export default router;
