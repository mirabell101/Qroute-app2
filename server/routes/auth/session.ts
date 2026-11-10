import { Router } from "express";

import requireAuth from "../../middleware/requireAuth.ts";
import { getSupabaseAdminClient } from "../../supabaseClient.ts";
import { getOrCreateDefaultUserRole } from "../../userRoles.ts";

const router = Router();

/**
 * Called after Google OAuth or email/password sign-in.
 *
 * The access token is verified by requireAuth first. The newly created role
 * is always `registered_user`; the endpoint never reads a role from the
 * request body and never grants administrator access.
 */
router.post("/", requireAuth, async (_req, res) => {
  const user = res.locals.user as { id?: string } | undefined;

  if (!user?.id) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    const role = await getOrCreateDefaultUserRole(
      getSupabaseAdminClient(),
      user.id
    );

    res.status(200).json({
      success: true,
      role,
    });
  } catch (error: unknown) {
    console.error(
      "[auth] Unable to resolve the user's role:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      success: false,
      message: "Unable to verify your account permissions.",
    });
  }
});

export default router;
