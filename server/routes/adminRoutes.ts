import { Router, type Request, type Response } from "express";
import requireAdmin from "../middleware/requireAdmin.ts";
import requireAuth from "../middleware/requireAuth.ts";
import {
  getAdminRoutes,
  getAdminSummary,
  getAdminUsers,
} from "../admin.ts";
import {
  getSupabaseAdminClient,
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";

const router = Router();

function sendAdminError(res: Response, error: unknown) {
  console.error("[admin] Data request failed:", error);
  res.status(500).json({
    success: false,
    message: "Unable to load admin data.",
  });
}

function getAccessToken(res: Response): string | null {
  const accessToken = res.locals.accessToken;
  return typeof accessToken === "string" && accessToken
    ? accessToken
    : null;
}

router.use(requireAuth, requireAdmin);

router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const summary = await getAdminSummary(getSupabaseAdminClient());
    res.json({ success: true, summary });
  } catch (error: unknown) {
    sendAdminError(res, error);
  }
});

router.get("/routes", async (_req: Request, res: Response) => {
  const accessToken = getAccessToken(res);
  if (!accessToken) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    const routes = await getAdminRoutes(
      getSupabaseClientForAccessToken(accessToken),
    );
    res.json({ success: true, routes });
  } catch (error: unknown) {
    sendAdminError(res, error);
  }
});

router.get("/users", async (_req: Request, res: Response) => {
  try {
    const users = await getAdminUsers(getSupabaseAdminClient());
    res.json({ success: true, users });
  } catch (error: unknown) {
    sendAdminError(res, error);
  }
});

export default router;
