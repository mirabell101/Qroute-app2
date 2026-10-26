
import type { RequestHandler } from "express";
import { getSupabaseClient } from "../supabaseClient.ts";

const requireAuth: RequestHandler = async (req, res, next) => {
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
    const {
      data: { user },
      error,
    } = await getSupabaseClient().auth.getUser(accessToken);

    if (error || !user) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired access token.",
      });
      return;
    }

    res.locals.user = user;
    next();
  } catch (error: unknown) {
    console.error("[auth] Token validation failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to authenticate the request.",
    });
  }
};

export default requireAuth;
