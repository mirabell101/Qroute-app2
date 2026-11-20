import type { RequestHandler } from "express";
import { getSupabaseClientForAccessToken } from "../supabaseClient.ts";

type VerifiedUserContext = {
  id?: unknown;
};

const requireRouteReviewer: RequestHandler = async (_req, res, next) => {
  const user = res.locals.user as VerifiedUserContext | undefined;
  const accessToken = res.locals.accessToken;

  if (
    typeof user?.id !== "string" ||
    !user.id ||
    typeof accessToken !== "string" ||
    !accessToken
  ) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    const { data, error } = await getSupabaseClientForAccessToken(accessToken)
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (error) {
      console.error("[routeManagement] Role lookup failed:", error.message);
      res.status(500).json({
        success: false,
        message: "Unable to verify Route Management access.",
      });
      return;
    }

    if (!data?.some((row) => row.role === "admin" || row.role === "moderator")) {
      res.status(403).json({
        success: false,
        message: "Route Management access required.",
      });
      return;
    }

    next();
  } catch (error: unknown) {
    console.error("[routeManagement] Role lookup failed:", error);
    res.status(500).json({
      success: false,
      message: "Unable to verify Route Management access.",
    });
  }
};

export default requireRouteReviewer;
