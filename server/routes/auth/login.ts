
import { Router, type Request, type Response } from "express";
import { createHmac } from "node:crypto";

import {
  getSupabaseClient,
  getSupabaseAdminClient,
} from "../../supabaseClient.ts";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{1,30}$/;

const LOGIN_ATTEMPT_HMAC_SECRET =
  process.env.LOGIN_ATTEMPT_HMAC_SECRET;

type ResolvedAccount = {
  user_id: string;
  email: string;
  is_deleted: boolean;
};

type ProtectionResult = {
  blocked?: boolean;
  scope?: "account" | "ip" | null;
  lockedUntil?: string | null;
};

function hashIpAddress(ipAddress: string): string {
  if (!LOGIN_ATTEMPT_HMAC_SECRET) {
    throw new Error("Missing LOGIN_ATTEMPT_HMAC_SECRET.");
  }

  return createHmac("sha256", LOGIN_ATTEMPT_HMAC_SECRET)
    .update(ipAddress)
    .digest("hex");
}

function getIpAddress(req: Request): string | null {
  // Use Express's resolved IP address.
  // Configure Express trust proxy appropriately for Vercel.
  return req.ip || null;
}

function sendGenericCredentialError(res: Response) {
  return res.status(401).json({
    success: false,
    message: "Unable to sign in. Check your credentials and try again.",
  });
}

async function checkProtection(
  adminSupabase: ReturnType<typeof getSupabaseAdminClient>,
  userId: string | null,
  ipKey: string,
): Promise<ProtectionResult> {
  const { data, error } = await adminSupabase.rpc(
    "check_login_protection",
    {
      p_user_id: userId,
      p_ip_key: ipKey,
    },
  );

  if (error) {
    console.error("Login protection check failed:", error);
    throw new Error("Unable to check login protection.");
  }

  return data as ProtectionResult;
}

async function recordFailedAttempt(
  adminSupabase: ReturnType<typeof getSupabaseAdminClient>,
  userId: string | null,
  ipKey: string,
) {
  const { data, error } = await adminSupabase.rpc(
    "record_login_failure",
    {
      p_user_id: userId,
      p_ip_key: ipKey,
    },
  );

  if (error) {
    console.error("Failed to record login attempt:", error);
    throw new Error("Unable to record login attempt.");
  }

  return data as {
    accountLockedUntil: string | null;
    ipBlockedUntil: string | null;
  };
}

function sendLockoutResponse(
  res: Response,
  scope: "account" | "ip",
  lockedUntil: string,
) {
  const isAccountLock = scope === "account";

  return res.status(429).json({
    success: false,
    code: isAccountLock ? "ACCOUNT_LOCKED" : "IP_BLOCKED",
    scope,
    lockedUntil,
    message: isAccountLock
      ? "Too many incorrect password attempts. Please wait before trying again."
      : "Too many failed login attempts from this network. Please try again later.",
  });
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const { identifier, email, password } = req.body ?? {};
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

    const isEmail = EMAIL_REGEX.test(normalizedIdentifier);

    if (
      !isEmail &&
      !USERNAME_REGEX.test(normalizedIdentifier)
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address or username.",
      });
    }

    const ipAddress = getIpAddress(req);

    if (!ipAddress) {
      console.error("Unable to determine login request IP.");
      return res.status(500).json({
        success: false,
        message: "Unable to sign in right now. Please try again.",
      });
    }

    const ipKey = hashIpAddress(ipAddress);

    const supabase = getSupabaseClient();
    const adminSupabase = getSupabaseAdminClient();

    // -----------------------------------------------------
    // 1. CHECK IP RESTRICTION BEFORE ACCOUNT LOOKUP
    // -----------------------------------------------------

    const initialProtection = await checkProtection(
      adminSupabase,
      null,
      ipKey,
    );

    if (
      initialProtection.blocked &&
      initialProtection.scope === "ip" &&
      initialProtection.lockedUntil
    ) {
      return sendLockoutResponse(
        res,
        "ip",
        initialProtection.lockedUntil,
      );
    }

    // -----------------------------------------------------
    // 2. RESOLVE EMAIL / USERNAME TO AUTH ACCOUNT
    // -----------------------------------------------------

    const { data: accounts, error: accountError } =
      await adminSupabase.rpc("resolve_login_account", {
        p_identifier: normalizedIdentifier,
      });

    if (accountError) {
      console.error("Account resolution error:", accountError);

      return res.status(500).json({
        success: false,
        message: "Unable to sign in right now. Please try again.",
      });
    }

    const account = (
      accounts as ResolvedAccount[] | null
    )?.[0];

    // -----------------------------------------------------
    // 3. UNKNOWN ACCOUNT
    // -----------------------------------------------------
    // Do not reveal whether the account exists.
    // Unknown identifiers still count toward IP protection.

    if (!account) {
      await recordFailedAttempt(
        adminSupabase,
        null,
        ipKey,
      );

      return sendGenericCredentialError(res);
    }

    // -----------------------------------------------------
    // 4. REJECT DELETED ACCOUNTS
    // -----------------------------------------------------

    if (account.is_deleted === true) {
      return sendGenericCredentialError(res);
    }

    // -----------------------------------------------------
    // 5. CHECK ACCOUNT AND IP RESTRICTIONS
    // -----------------------------------------------------

    const protection = await checkProtection(
      adminSupabase,
      account.user_id,
      ipKey,
    );

    if (
      protection.blocked &&
      protection.scope &&
      protection.lockedUntil
    ) {
      return sendLockoutResponse(
        res,
        protection.scope,
        protection.lockedUntil,
      );
    }

    // -----------------------------------------------------
    // 6. VERIFY PASSWORD USING SUPABASE AUTH
    // -----------------------------------------------------

    const loginEmail = account.email;

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

    // Preserve the existing OTP verification flow.
    // An unverified email is not an incorrect password.

    if (error?.code === "email_not_confirmed") {
      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        requiresEmailVerification: true,
        email: loginEmail,
        message: "Please verify your email address to continue.",
      });
    }

    // -----------------------------------------------------
    // 7. INCORRECT PASSWORD
    // -----------------------------------------------------

    if (
      error &&
      (
        error.code === "invalid_credentials" ||
        error.message === "Invalid login credentials"
      )
    ) {
      const failureResult = await recordFailedAttempt(
        adminSupabase,
        account.user_id,
        ipKey,
      );

      // Account restriction takes priority if both apply.

      if (failureResult.accountLockedUntil) {
        return sendLockoutResponse(
          res,
          "account",
          failureResult.accountLockedUntil,
        );
      }

      if (failureResult.ipBlockedUntil) {
        return sendLockoutResponse(
          res,
          "ip",
          failureResult.ipBlockedUntil,
        );
      }

      return sendGenericCredentialError(res);
    }

    // Do not count infrastructure or unexpected Auth errors
    // as incorrect passwords.

    if (error) {
      console.error("Supabase Auth login error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to sign in right now. Please try again.",
      });
    }

    if (!data.session || !data.user) {
      return res.status(500).json({
        success: false,
        message: "Authentication session was not returned.",
      });
    }

    // -----------------------------------------------------
    // 8. RESET ACCOUNT FAILURES AFTER SUCCESS
    // -----------------------------------------------------
    // IP failures intentionally remain unchanged.

    const { error: resetError } = await adminSupabase.rpc(
      "reset_login_attempts",
      {
        p_user_id: account.user_id,
      },
    );

    if (resetError) {
      // The user has already authenticated successfully.
      // Do not turn a successful login into a failed login.
      console.error(
        "Could not reset account login attempts:",
        resetError,
      );
    }

    // -----------------------------------------------------
    // 9. RETURN EXISTING SESSION FORMAT
    // -----------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username:
          data.user.user_metadata?.username ?? null,
        displayName:
          data.user.user_metadata?.display_name ?? null,
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

export default router;
