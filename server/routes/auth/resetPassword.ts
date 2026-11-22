import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";

import requireAuth from "../../middleware/requireAuth.ts";
import { isStrongAccountPassword } from "../../account.ts";

import {
  SupabaseUserUpdateError,
  getSupabaseClientForAccessToken,
  updateSupabaseUserPassword,
} from "../../supabaseClient.ts";

const router = Router();

// ============================================================
// CONFIGURATION
// ============================================================

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const INVALID_RECOVERY_MESSAGE =
  "Your recovery session is invalid or expired. Please request a new recovery link.";

const RECOVERY_REQUIRED_MESSAGE =
  "A valid password recovery session is required to update your password.";

const PASSWORD_UPDATE_ERROR_MESSAGE =
  "Unable to update your password. Please try again.";

const PASSWORD_POLICY_ERROR_MESSAGE =
  "The password does not satisfy the authentication provider's password requirements.";

// ============================================================
// TYPES
// ============================================================

interface VerifiedRecoveryClaims {
  sub?: unknown;
  role?: unknown;
  aud?: unknown;
  session_id?: unknown;
  amr?: unknown;
  is_anonymous?: unknown;
}

interface AuthenticatedMiddlewareUser {
  id?: unknown;
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Reads a numeric HTTP status from a Supabase or SDK error.
 */
function getErrorStatus(error: unknown): number | null {
  if (
    isRecord(error) &&
    typeof error.status === "number" &&
    Number.isInteger(error.status)
  ) {
    return error.status;
  }

  return null;
}

/**
 * Returns true when Supabase rejected the supplied token
 * as invalid or unauthorized.
 *
 * Infrastructure failures are deliberately not classified
 * as invalid credentials.
 */
function isInvalidTokenError(error: unknown): boolean {
  const status = getErrorStatus(error);

  return (
    status === 400 ||
    status === 401 ||
    status === 403
  );
}

/**
 * Accepts only an authenticated Supabase user token.
 */
function hasAuthenticatedAudience(
  audience: unknown,
): boolean {
  if (audience === "authenticated") {
    return true;
  }

  return (
    Array.isArray(audience) &&
    audience.includes("authenticated")
  );
}

/**
 * Checks the authentication-method claim from an already
 * cryptographically verified Supabase JWT.
 *
 * This function must only receive claims returned by
 * Supabase auth.getClaims().
 *
 * It must never receive locally decoded or unverified JWT data.
 *
 * Supabase normally represents AMR entries as objects:
 *
 * {
 *   method: "recovery",
 *   timestamp: 1234567890
 * }
 *
 * The string representation is retained for compatibility
 * with earlier token formats.
 */
function hasRecoveryAuthenticationMethod(
  claims: VerifiedRecoveryClaims,
): boolean {
  if (!Array.isArray(claims.amr)) {
    return false;
  }

  return claims.amr.some((entry: unknown) => {
    if (entry === "recovery") {
      return true;
    }

    if (!isRecord(entry)) {
      return false;
    }

    return entry.method === "recovery";
  });
}

/**
 * Confirms that the middleware has already established
 * a verified user identity for this exact bearer token.
 */
function getVerifiedMiddlewareUserId(
  response: Response,
): string | null {
  const middlewareUser =
    response.locals.user as
      | AuthenticatedMiddlewareUser
      | undefined;

  if (
    !middlewareUser ||
    typeof middlewareUser.id !== "string" ||
    !middlewareUser.id.trim()
  ) {
    return null;
  }

  return middlewareUser.id;
}

/**
 * Checks that verified JWT claims describe the same
 * authenticated user validated by requireAuth.
 */
function claimsMatchMiddlewareUser(
  claims: VerifiedRecoveryClaims,
  middlewareUserId: string,
): boolean {
  return (
    typeof claims.sub === "string" &&
    claims.sub.trim().length > 0 &&
    claims.sub === middlewareUserId &&
    claims.role === "authenticated" &&
    hasAuthenticatedAudience(claims.aud) &&
    typeof claims.session_id === "string" &&
    claims.session_id.trim().length > 0 &&
    claims.is_anonymous !== true
  );
}

/**
 * Sends an invalid-recovery response.
 */
function sendInvalidRecovery(
  response: Response,
): Response {
  return response.status(401).json({
    success: false,
    message: INVALID_RECOVERY_MESSAGE,
  });
}

/**
 * Handles password-update errors returned by Supabase.
 *
 * Invalid or expired credentials are not treated as generic
 * server errors.
 */
function handlePasswordUpdateError(
  response: Response,
  error: unknown,
): Response {
  if (error instanceof SupabaseUserUpdateError) {
    if (error.status === 401 || error.status === 403) {
      return sendInvalidRecovery(response);
    }

    if (error.status === 400 || error.status === 422) {
      return response.status(400).json({
        success: false,
        message: PASSWORD_POLICY_ERROR_MESSAGE,
      });
    }

    if (error.status === 429) {
      return response.status(429).json({
        success: false,
        message:
          "Too many password update requests. Please try again later.",
      });
    }
  }

  console.error(
    "Password update request failed:",
    error instanceof Error
      ? error.message
      : "Unknown error",
  );

  return response.status(502).json({
    success: false,
    message: PASSWORD_UPDATE_ERROR_MESSAGE,
  });
}

// ============================================================
// RESET PASSWORD
// ============================================================

router.post(
  "/",
  resetPasswordLimiter,
  requireAuth,
  async (req, res) => {
    // Prevent caching responses associated with authentication.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    try {
      // ------------------------------------------------------
      // 1. VALIDATE REQUEST BODY
      // ------------------------------------------------------

      if (
        !isRecord(req.body) ||
        Object.keys(req.body).length !== 1 ||
        typeof req.body.password !== "string" ||
        !isStrongAccountPassword(req.body.password)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Provide a password that meets all requirements.",
        });
      }

      const newPassword = req.body.password;

      // ------------------------------------------------------
      // 2. RETRIEVE THE MIDDLEWARE-VERIFIED ACCESS TOKEN
      // ------------------------------------------------------

      const accessToken = res.locals.accessToken;

      if (
        typeof accessToken !== "string" ||
        !accessToken.trim()
      ) {
        return sendInvalidRecovery(res);
      }

      // ------------------------------------------------------
      // 3. CONFIRM MIDDLEWARE AUTHENTICATION
      // ------------------------------------------------------

      /**
       * requireAuth must have verified the bearer token
       * and populated res.locals.user.
       *
       * Do not accept claims for a user different from
       * the user verified by the authentication middleware.
       */
      const middlewareUserId =
        getVerifiedMiddlewareUserId(res);

      if (!middlewareUserId) {
        return sendInvalidRecovery(res);
      }

      // ------------------------------------------------------
      // 4. VERIFY JWT CLAIMS WITH SUPABASE
      // ------------------------------------------------------

      /**
       * Use the stateless, request-scoped Supabase client.
       *
       * getClaims(accessToken) verifies the supplied JWT
       * against the project's configured signing keys.
       *
       * Never replace this with locally decoded JWT claims.
       */
      const authClient =
        getSupabaseClientForAccessToken(accessToken);

      let claimsData:
        | {
            claims?: Record<string, unknown>;
          }
        | null = null;

      let claimsError: unknown = null;

      try {
        const verification =
          await authClient.auth.getClaims(accessToken);

        claimsData = verification.data;
        claimsError = verification.error;
      } catch (error: unknown) {
        if (isInvalidTokenError(error)) {
          return sendInvalidRecovery(res);
        }

        console.error(
          "Recovery token verification failed:",
          error instanceof Error
            ? error.message
            : "Unknown verification error",
        );

        return res.status(503).json({
          success: false,
          message:
            "Password recovery verification is temporarily unavailable. Please try again.",
        });
      }

      if (claimsError) {
        if (isInvalidTokenError(claimsError)) {
          return sendInvalidRecovery(res);
        }

        console.error(
          "Recovery token verification service error:",
          claimsError instanceof Error
            ? claimsError.message
            : "Unknown verification error",
        );

        return res.status(503).json({
          success: false,
          message:
            "Password recovery verification is temporarily unavailable. Please try again.",
        });
      }

      if (
        !claimsData ||
        !claimsData.claims ||
        !isRecord(claimsData.claims)
      ) {
        return sendInvalidRecovery(res);
      }

      const claims =
        claimsData.claims as VerifiedRecoveryClaims;

      // ------------------------------------------------------
      // 5. VERIFY AUTHENTICATED USER CLAIMS
      // ------------------------------------------------------

      /**
       * Require:
       * - A nonempty verified subject.
       * - The authenticated Supabase role.
       * - The authenticated audience.
       * - A nonempty Supabase session identifier.
       * - A non-anonymous user.
       * - The same user ID already verified by requireAuth.
       */
      if (
        !claimsMatchMiddlewareUser(
          claims,
          middlewareUserId,
        )
      ) {
        return sendInvalidRecovery(res);
      }

      // ------------------------------------------------------
      // 6. REQUIRE PASSWORD RECOVERY AUTHENTICATION
      // ------------------------------------------------------

      /**
       * A normal password login must not satisfy this check.
       *
       * A Google OAuth session must not satisfy this check.
       *
       * Only a verified recovery authentication method
       * is accepted.
       */
      if (!hasRecoveryAuthenticationMethod(claims)) {
        return res.status(403).json({
          success: false,
          message: RECOVERY_REQUIRED_MESSAGE,
        });
      }

      // ------------------------------------------------------
      // 7. UPDATE PASSWORD USING THE EXACT RECOVERY TOKEN
      // ------------------------------------------------------

      /**
       * updateSupabaseUserPassword sends the request directly
       * to the Supabase Auth user endpoint using this exact
       * recovery access token.
       *
       * It does not use an administrator service-role client.
       * It does not substitute another browser session.
       */
      try {
        await updateSupabaseUserPassword(
          accessToken,
          newPassword,
        );
      } catch (error: unknown) {
        return handlePasswordUpdateError(
          res,
          error,
        );
      }

      // ------------------------------------------------------
      // 8. SUCCESS
      // ------------------------------------------------------

      return res.status(200).json({
        success: true,
        message:
          "Password updated successfully. Please sign in.",
      });
    } catch (error: unknown) {
      console.error(
        "Password update route failed:",
        error instanceof Error
          ? error.message
          : "Unknown error",
      );

      return res.status(502).json({
        success: false,
        message:
          "Unable to update your password. Please try again.",
      });
    }
  },
);

export default router;