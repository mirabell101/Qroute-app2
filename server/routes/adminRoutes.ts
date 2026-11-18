import { Router, type Request, type Response } from "express";
import requireAdmin from "../middleware/requireAdmin.ts";
import requireAuth from "../middleware/requireAuth.ts";
import {
  AdminInputError,
  AdminNotFoundError,
  createAdminRoute,
  deleteAdminPost,
  deleteAdminRoute,
  getAdminCommunityPosts,
  getAdminReports,
  getAdminRoutes,
  getAdminSummary,
  getAdminUsers,
  setCommunityPostVisibility,
  toggleAdminUserBan,
  updateAdminReportStatus,
  updateAdminRoute,
} from "../admin.ts";
import {
  getAdminUnreadNotificationCount,
  listAdminNotifications,
  markAdminNotificationRead,
} from "../adminNotifications.ts";
import {
  parseAdminRouteCreateInput,
  parseAdminRouteUpdateInput,
} from "../adminValidation.ts";
import {
  getSupabaseAdminClient,
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";
import {
  downloadCommunityPhoto,
  parsePhotoIndex,
  resolvePhotoPath,
  sendCommunityPhoto,
} from "../communityPhotos.ts";

const router = Router();

function sendAdminError(res: Response, error: unknown, message?: string) {
  if (error instanceof AdminInputError) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
    return;
  }
  if (error instanceof AdminNotFoundError) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
    return;
  }
  console.error("[admin] Data request failed:", error);
  res.status(500).json({
    success: false,
    message: message ?? "Unable to load admin data.",
  });
}

function getAccessToken(res: Response): string | null {
  const accessToken = res.locals.accessToken;
  return typeof accessToken === "string" && accessToken
    ? accessToken
    : null;
}

function getAdminUserId(res: Response): string | null {
  const id = (res.locals.user as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id ? id : null;
}

function parseRouteId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

// Accepts only lowercase UUIDs in the standard 8-4-4-4-12 format.
// Rejecting malformed IDs early prevents them from reaching the database.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parseUuid(value: string): string | null {
  return UUID_PATTERN.test(value) ? value : null;
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

router.post("/routes", async (req: Request, res: Response) => {
  const parsed = parseAdminRouteCreateInput(req.body);
  if (parsed.error) {
    res.status(400).json({
      success: false,
      message: parsed.error,
    });
    return;
  }

  const adminUserId = getAdminUserId(res);
  if (!adminUserId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    const route = await createAdminRoute(
      getSupabaseAdminClient(),
      parsed.data,
      adminUserId,
    );
    res.status(201).json({ success: true, route });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to create the route.");
  }
});

router.patch("/routes/:id", async (req: Request, res: Response) => {
  const id = parseRouteId(req.params.id);
  if (id === null) {
    res.status(400).json({
      success: false,
      message: "A valid route id is required.",
    });
    return;
  }

  const parsed = parseAdminRouteUpdateInput(req.body);
  if (parsed.error) {
    res.status(400).json({
      success: false,
      message: parsed.error,
    });
    return;
  }

  const adminUserId = getAdminUserId(res);
  if (!adminUserId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    await updateAdminRoute(getSupabaseAdminClient(), id, parsed.data, adminUserId);
    res.json({ success: true });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to update the route.");
  }
});

router.delete("/routes/:id", async (req: Request, res: Response) => {
  const id = parseRouteId(req.params.id);
  if (id === null) {
    res.status(400).json({
      success: false,
      message: "A valid route id is required.",
    });
    return;
  }

  const adminUserId = getAdminUserId(res);
  if (!adminUserId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    await deleteAdminRoute(getSupabaseAdminClient(), id, adminUserId);
    res.json({ success: true });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to delete the route.");
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

router.get("/posts", async (_req: Request, res: Response) => {
  try {
    const posts = await getAdminCommunityPosts(getSupabaseAdminClient());
    res.json({ success: true, posts });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to load community posts.");
  }
});

router.get("/reports", async (_req: Request, res: Response) => {
  try {
    const reports = await getAdminReports(getSupabaseAdminClient());
    res.json({ success: true, reports });
  } catch (error: unknown) {
    sendAdminError(res, error);
  }
});

router.patch("/reports/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (!id || !["Pending", "Reviewed", "Dismissed"].includes(status)) {
    res.status(400).json({
      success: false,
      message: "Valid report id and status are required.",
    });
    return;
  }

  try {
    await updateAdminReportStatus(getSupabaseAdminClient(), id, status);
    res.json({ success: true });
  } catch (error: unknown) {
    sendAdminError(res, error);
  }
});

router.delete("/posts/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({
      success: false,
      message: "Post id is required.",
    });
    return;
  }

  try {
    await deleteAdminPost(getSupabaseAdminClient(), id);
    res.json({ success: true });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to delete the community post.");
  }
});

router.patch("/users/:id/ban", async (req: Request, res: Response) => {
  const id = req.params.id;
  const { ban } = req.body;
  if (!id || typeof ban !== "boolean") {
    res.status(400).json({
      success: false,
      message: "Valid user id and ban boolean status are required.",
    });
    return;
  }

  try {
    await toggleAdminUserBan(getSupabaseAdminClient(), id, ban);
    res.json({ success: true });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to update the user's access.");
  }
});

function getVerifiedAdminContext(res: Response) {
  const accessToken = getAccessToken(res);
  const adminUserId = getAdminUserId(res);
  if (!accessToken || !adminUserId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return null;
  }
  return { accessToken, adminUserId };
}

router.get("/notifications", async (_req: Request, res: Response) => {
  const context = getVerifiedAdminContext(res);
  if (!context) return;

  try {
    const result = await listAdminNotifications(
      getSupabaseClientForAccessToken(context.accessToken),
      context.adminUserId,
    );
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to load admin notifications.");
  }
});

router.get("/notifications/unread-count", async (_req: Request, res: Response) => {
  const context = getVerifiedAdminContext(res);
  if (!context) return;

  try {
    const unreadCount = await getAdminUnreadNotificationCount(
      getSupabaseClientForAccessToken(context.accessToken),
      context.adminUserId,
    );
    res.json({ success: true, unreadCount });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to load the unread notification count.");
  }
});

router.patch("/notifications/:id/read", async (req: Request, res: Response) => {
  const notificationId = parseUuid(req.params.id);
  if (!notificationId) {
    res.status(400).json({
      success: false,
      message: "A valid notification id is required.",
    });
    return;
  }

  const context = getVerifiedAdminContext(res);
  if (!context) return;

  try {
    await markAdminNotificationRead(
      getSupabaseClientForAccessToken(context.accessToken),
      context.adminUserId,
      notificationId,
    );
    res.json({ success: true });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to mark the notification as read.");
  }
});

// Hidden-post photos are only reachable through this protected router. The
// admin client can read every post, but the path is still checked against the
// requested post before any object is downloaded.
router.get(
  "/posts/:postId/photos/:photoIndex",
  async (req: Request, res: Response) => {
    const postId = parseUuid(req.params.postId);
    const photoIndex = parsePhotoIndex(req.params.photoIndex);
    res.setHeader("Cache-Control", "no-store");

    if (!postId || photoIndex === null) {
      res.status(400).json({
        success: false,
        message: "A valid post id and photo index are required.",
      });
      return;
    }

    try {
      const { data: post, error } = await getSupabaseAdminClient()
        .from("community_posts")
        .select("photo_paths")
        .eq("id", postId)
        .maybeSingle();

      if (error) throw error;
      if (!post) {
        res.status(404).json({ success: false, message: "Post not found." });
        return;
      }

      const photoPath = resolvePhotoPath(post.photo_paths, photoIndex);
      if (!photoPath) {
        res.status(404).json({ success: false, message: "Photo not found." });
        return;
      }

      const photo = await downloadCommunityPhoto(
        getSupabaseAdminClient(),
        photoPath,
      );
      sendCommunityPhoto(res, photo.bytes, photo.contentType);
    } catch (error: unknown) {
      sendAdminError(res, error, "Unable to load the community post photo.");
    }
  },
);

router.patch("/posts/:id/visibility", async (req: Request, res: Response) => {
  const postId = parseUuid(req.params.id);
  const isHidden = req.body?.isHidden;
  if (!postId || typeof isHidden !== "boolean") {
    res.status(400).json({
      success: false,
      message: "A valid post id and boolean isHidden value are required.",
    });
    return;
  }

  try {
    await setCommunityPostVisibility(
      getSupabaseAdminClient(),
      postId,
      isHidden,
    );
    res.json({ success: true });
  } catch (error: unknown) {
    sendAdminError(res, error, "Unable to update the community post visibility.");
  }
});

export default router;