
import type { RequestHandler } from "express";

import {
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";

const requireAuth: RequestHandler = async (
  req,
  res,
  next,
) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });

    return;
  }

  const accessToken = authorization.slice(7).trim();

  if (!accessToken) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });

    return;
  }

  try {
    const authClient =
      getSupabaseClientForAccessToken(accessToken);

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(accessToken);

    if (error || !user) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired access token.",
      });

      return;
    }

    /**
     * These values are attached only after Supabase
     * independently verifies the supplied access token.
     *
     * Preserve the existing locals for compatibility with
     * all downstream routes and middleware.
     */
    res.locals.user = user;
    res.locals.userId = user.id;
    res.locals.authenticatedUserId = user.id;
    res.locals.accessToken = accessToken;

    next();
  } catch (error: unknown) {
    console.error(
      "[auth] Token validation failed:",
      error instanceof Error
        ? error.message
        : "Unknown authentication error",
    );

    res.status(500).json({
      success: false,
      message: "Unable to authenticate the request.",
    });
  }
};

export default requireAuth;
