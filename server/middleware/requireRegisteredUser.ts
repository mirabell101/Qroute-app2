import type { RequestHandler } from "express";
import { getSupabaseClientForAccessToken } from "../supabaseClient.ts";

const requireRegisteredUser: RequestHandler = async (_req, res, next) => {
  const user = res.locals.user as { id: string } | undefined;
  const accessToken = res.locals.accessToken as string | undefined;

  if (!user?.id || !accessToken) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    const supabase = getSupabaseClientForAccessToken(accessToken);
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "registered_user")
      .maybeSingle();

    if (error) {
      console.error("[community] Role lookup failed:", error.message);
      res.status(500).json({
        success: false,
        message: "Unable to verify account permissions.",
      });
      return;
    }

    if (!data) {
      res.status(403).json({
        success: false,
        message: "A registered-user account is required.",
      });
      return;
    }

    res.locals.communitySupabase = supabase;
    next();
  } catch (error: unknown) {
    console.error("[community] Role authorization failed:", error);
    res.status(500).json({
      success: false,
      message: "Unable to verify account permissions.",
    });
  }
};

export default requireRegisteredUser;
