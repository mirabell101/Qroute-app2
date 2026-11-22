
import { Router, type Request, type Response } from "express";

import requireAdmin from "../middleware/requireAdmin.ts";
import requireAuth from "../middleware/requireAuth.ts";

import {
  AdminAuthSyncError,
  AdminForbiddenError,
  AdminInputError,
  AdminNotFoundError,
  applyAdminUserRestriction,
  deleteAdminPost,
  deleteAdminRoute,
  getAdminCommunityPosts,
  getAdminReports,
  getAdminRoutes,
  getAdminSummary,
  getAdminUserModerationHistory,
  getAdminUsers,
  setCommunityPostVisibility,
  updateAdminReportStatus,
  updateAdminRoute,
  updateAdminUserRole,
  type AdminUserRestrictionAction,
  type AdminUserRole,
} from "../admin.ts";

import { writeAdminAuditLog } from "../adminAudit.ts";

import {
  getAdminUnreadNotificationCount,
  listAdminNotifications,
  markAdminNotificationRead,
} from "../adminNotifications.ts";

import {
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

// -----------------------------------------------------------------------------
// Request validation
// -----------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const userRestrictionActions = [
  "mute",
  "unmute",
  "ban_temporary",
  "ban_permanent",
  "unban",
] as const satisfies readonly AdminUserRestrictionAction[];

const maximumRestrictionReasonLength = 1000;

function getRequestBody(
  value: unknown,
): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseRouteId(value: string): number | null {
  const id = Number(value);

  return Number.isSafeInteger(id) && id >= 1
    ? id
    : null;
}

function parseUuid(value: string): string | null {
  return UUID_PATTERN.test(value)
    ? value
    : null;
}

function isAdminUserRole(
  value: unknown,
): value is AdminUserRole {
  return (
    value === "registered_user" ||
    value === "admin"
  );
}

function isAdminUserRestrictionAction(
  value: unknown,
): value is AdminUserRestrictionAction {
  return (
    typeof value === "string" &&
    userRestrictionActions.includes(
      value as AdminUserRestrictionAction,
    )
  );
}

// -----------------------------------------------------------------------------
// Error handling
// -----------------------------------------------------------------------------

function sendAdminError(
  res: Response,
  error: unknown,
  message?: string,
): void {
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

  if (error instanceof AdminForbiddenError) {
    res.status(403).json({
      success: false,
      message: error.message,
    });

    return;
  }

  if (error instanceof AdminAuthSyncError) {
    res.status(502).json({
      success: false,
      message: error.message,
      restrictionSaved: true,
    });

    return;
  }

  console.error(
    "[admin] Data request failed:",
    error,
  );

  res.status(500).json({
    success: false,
    message: message ?? "Unable to load admin data.",
  });
}

// -----------------------------------------------------------------------------
// Verified administrator context
// -----------------------------------------------------------------------------

function getAccessToken(
  res: Response,
): string | null {
  const accessToken = res.locals.accessToken;

  return (
    typeof accessToken === "string" && accessToken
      ? accessToken
      : null
  );
}

function getAdminUserId(
  res: Response,
): string | null {
  const id = (
    res.locals.user as
      | { id?: unknown }
      | undefined
  )?.id;

  return (
    typeof id === "string" && id
      ? id
      : null
  );
}

function getVerifiedAdminContext(
  res: Response,
) {
  const accessToken = getAccessToken(res);
  const adminUserId = getAdminUserId(res);

  if (!accessToken || !adminUserId) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });

    return null;
  }

  return {
    accessToken,
    adminUserId,
  };
}

// -----------------------------------------------------------------------------
// Best-effort audit helper
// -----------------------------------------------------------------------------
//
// Keep this helper for operations whose audit insertion is not yet
// performed transactionally by a database RPC.
//
// Do NOT use it for:
// - admin_set_user_role
// - admin_set_user_restriction
//
// Both RPCs already insert their corresponding audit records
// inside the same database transaction as the administrative action.

async function recordAdminAudit(
  input: Parameters<typeof writeAdminAuditLog>[0],
): Promise<void> {
  try {
    await writeAdminAuditLog(input);
  } catch (error) {
    console.error(
      "[admin] Audit log call failed:",
      error instanceof Error
        ? error.message
        : error,
    );
  }
}

// -----------------------------------------------------------------------------
// Global authentication and administrator authorization
// -----------------------------------------------------------------------------

router.use(requireAuth, requireAdmin);

// -----------------------------------------------------------------------------
// Dashboard summary
// -----------------------------------------------------------------------------

router.get(
  "/summary",
  async (_req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      const summary = await getAdminSummary(
        getSupabaseAdminClient(),
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
      );

      res.json({
        success: true,
        summary,
      });
    } catch (error: unknown) {
      sendAdminError(res, error);
    }
  },
);

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

router.get(
  "/routes",
  async (_req: Request, res: Response) => {
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

      res.json({
        success: true,
        routes,
      });
    } catch (error: unknown) {
      sendAdminError(res, error);
    }
  },
);

router.patch(
  "/routes/:id",
  async (req: Request, res: Response) => {
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

    const accessToken = getAccessToken(res);

    if (!accessToken) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });

      return;
    }

    try {
      await updateAdminRoute(
        getSupabaseClientForAccessToken(accessToken),
        id,
        parsed.data,
      );

      res.json({
        success: true,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to update the route.",
      );
    }
  },
);

router.delete(
  "/routes/:id",
  async (req: Request, res: Response) => {
    const id = parseRouteId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "A valid route id is required.",
      });

      return;
    }

    const accessToken = getAccessToken(res);

    if (!accessToken) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });

      return;
    }

    try {
      await deleteAdminRoute(
        getSupabaseClientForAccessToken(accessToken),
        id,
      );

      res.json({
        success: true,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to delete the route.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// User Management: account listing
// -----------------------------------------------------------------------------

router.get(
  "/users",
  async (_req: Request, res: Response) => {
    try {
      const users = await getAdminUsers(
        getSupabaseAdminClient(),
      );

      res.json({
        success: true,
        users,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load user accounts.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// User Management: role assignment
// -----------------------------------------------------------------------------
//
// Only these roles are accepted:
// - registered_user
// - admin
//
// The database RPC performs:
// - Administrator verification.
// - Deleted-actor protection.
// - Deleted-target promotion protection.
// - Effective-ban promotion protection.
// - Last-administrator protection.
// - Self-demotion protection.
// - Transactional audit insertion.
//
// Do not insert a second audit entry here.

router.patch(
  "/users/:id/role",
  async (req: Request, res: Response) => {
    const userId = parseUuid(req.params.id);
    const body = getRequestBody(req.body);

    const role = body?.role;

    if (!userId || !isAdminUserRole(role)) {
      res.status(400).json({
        success: false,
        message:
          "A valid user id and supported account role are required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      await updateAdminUserRole(
        getSupabaseAdminClient(),
        context.adminUserId,
        userId,
        role,
      );

      res.json({
        success: true,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to update the user's role.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// User Management: restriction management
// -----------------------------------------------------------------------------
//
// Supported actions:
// - mute
// - unmute
// - ban_temporary
// - ban_permanent
// - unban
//
// Expected request body:
// {
//   action: "mute",
//   durationSeconds: 86400 | null,
//   reason: "Reason"
// }
//
// Duration rules are ultimately enforced by the database RPC.
// A null mute duration means an indefinite mute.
//
// The database RPC changes the moderation row and writes the audit
// event transactionally. Auth synchronization occurs afterward for
// ban-related actions only.
//
// No separate recordAdminAudit() call is permitted here.

router.post(
  "/users/:id/restrictions",
  async (req: Request, res: Response) => {
    const userId = parseUuid(req.params.id);
    const body = getRequestBody(req.body);

    if (!userId || !body) {
      res.status(400).json({
        success: false,
        message: "Valid user restriction details are required.",
      });

      return;
    }

    const action = body.action;
    const durationValue = body.durationSeconds;
    const reasonValue = body.reason;

    if (!isAdminUserRestrictionAction(action)) {
      res.status(400).json({
        success: false,
        message: "A supported moderation action is required.",
      });

      return;
    }

    const durationSeconds =
      durationValue === undefined
        ? null
        : durationValue;

    if (
      durationSeconds !== null &&
      (
        typeof durationSeconds !== "number" ||
        !Number.isSafeInteger(durationSeconds)
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "Duration must be a whole number of seconds or null.",
      });

      return;
    }

    const reason =
      reasonValue === undefined
        ? null
        : reasonValue;

    if (
      reason !== null &&
      typeof reason !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "The restriction reason must be text.",
      });

      return;
    }

    if (
      typeof reason === "string" &&
      reason.length > maximumRestrictionReasonLength
    ) {
      res.status(400).json({
        success: false,
        message:
          `Restriction reasons cannot exceed ${maximumRestrictionReasonLength} characters.`,
      });

      return;
    }

    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      const restriction = await applyAdminUserRestriction(
        getSupabaseAdminClient(),
        context.adminUserId,
        userId,
        action,
        durationSeconds,
        reason,
      );

      res.json({
        success: true,
        restriction,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to update the user's restrictions.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// User Management: moderation history
// -----------------------------------------------------------------------------
//
// History comes from admin_audit_logs.
// The verified database RPCs already create the entries atomically.

router.get(
  "/users/:id/moderation-history",
  async (req: Request, res: Response) => {
    const userId = parseUuid(req.params.id);

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "A valid user id is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      const history = await getAdminUserModerationHistory(
        getSupabaseAdminClient(),
        userId,
      );

      res.json({
        success: true,
        history,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load the user's moderation history.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Community posts
// -----------------------------------------------------------------------------

router.get(
  "/posts",
  async (_req: Request, res: Response) => {
    try {
      const posts = await getAdminCommunityPosts(
        getSupabaseAdminClient(),
      );

      res.json({
        success: true,
        posts,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load community posts.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Reports
// -----------------------------------------------------------------------------

router.get(
  "/reports",
  async (_req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      const reports = await getAdminReports(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
      );

      res.json({
        success: true,
        reports,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load community reports.",
      );
    }
  },
);

router.patch(
  "/reports/:id",
  async (req: Request, res: Response) => {
    const id = parseRouteId(req.params.id);
    const body = getRequestBody(req.body);

    const status = body?.status;

    if (
      id === null ||
      (
        status !== "Pending" &&
        status !== "Reviewed" &&
        status !== "Dismissed"
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid report id and status are required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      await updateAdminReportStatus(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        id,
        status,
      );

      // Retain existing best-effort audit behavior for report updates.
      await recordAdminAudit({
        adminUserId: context.adminUserId,
        categoryKey: "report_management",
        actionKey: "report_status_updated",
        actionTitle: "Report status updated",
        description:
          `Changed report #${id} status to ${status}.`,
        targetType: "report",
        targetId: String(id),
        targetLabel: `Report #${id}`,
        metadata: {
          reportId: id,
          newStatus: status,
        },
      });

      res.json({
        success: true,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to update the community report.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Community post deletion
// -----------------------------------------------------------------------------

router.delete(
  "/posts/:id",
  async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id) {
      res.status(400).json({
        success: false,
        message: "Post id is required.",
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
      await deleteAdminPost(
        getSupabaseAdminClient(),
        id,
      );

      await recordAdminAudit({
        adminUserId,
        categoryKey: "moderation",
        actionKey: "community_post_deleted",
        actionTitle: "Community post deleted",
        description: `Deleted community post ${id}.`,
        targetType: "community_post",
        targetId: id,
        targetLabel: `Post ${id}`,
        metadata: {
          postId: id,
          deletionType: "permanent",
        },
      });

      res.json({
        success: true,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to delete the community post.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Admin notifications
// -----------------------------------------------------------------------------

router.get(
  "/notifications",
  async (_req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      const result = await listAdminNotifications(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        context.adminUserId,
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load admin notifications.",
      );
    }
  },
);

router.get(
  "/notifications/unread-count",
  async (_req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      const unreadCount =
        await getAdminUnreadNotificationCount(
          getSupabaseClientForAccessToken(
            context.accessToken,
          ),
          context.adminUserId,
        );

      res.json({
        success: true,
        unreadCount,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load the unread notification count.",
      );
    }
  },
);

router.patch(
  "/notifications/:id/read",
  async (req: Request, res: Response) => {
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
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        context.adminUserId,
        notificationId,
      );

      res.json({
        success: true,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to mark the notification as read.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Protected community-post photo access
// -----------------------------------------------------------------------------

router.get(
  "/posts/:postId/photos/:photoIndex",
  async (req: Request, res: Response) => {
    const postId = parseUuid(req.params.postId);
    const photoIndex = parsePhotoIndex(
      req.params.photoIndex,
    );

    res.setHeader("Cache-Control", "no-store");

    if (!postId || photoIndex === null) {
      res.status(400).json({
        success: false,
        message:
          "A valid post id and photo index are required.",
      });

      return;
    }

    try {
      const { data: post, error } =
        await getSupabaseAdminClient()
          .from("community_posts")
          .select("photo_paths")
          .eq("id", postId)
          .maybeSingle();

      if (error) throw error;

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Post not found.",
        });

        return;
      }

      const photoPath = resolvePhotoPath(
        post.photo_paths,
        photoIndex,
      );

      if (!photoPath) {
        res.status(404).json({
          success: false,
          message: "Photo not found.",
        });

        return;
      }

      const photo = await downloadCommunityPhoto(
        getSupabaseAdminClient(),
        photoPath,
      );

      sendCommunityPhoto(
        res,
        photo.bytes,
        photo.contentType,
      );
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load the community post photo.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Community-post visibility
// -----------------------------------------------------------------------------

router.patch(
  "/posts/:id/visibility",
  async (req: Request, res: Response) => {
    const postId = parseUuid(req.params.id);
    const body = getRequestBody(req.body);
    const isHidden = body?.isHidden;

    if (!postId || typeof isHidden !== "boolean") {
      res.status(400).json({
        success: false,
        message:
          "A valid post id and boolean isHidden value are required.",
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
      await setCommunityPostVisibility(
        getSupabaseAdminClient(),
        postId,
        isHidden,
      );

      await recordAdminAudit({
        adminUserId,
        categoryKey: "moderation",
        actionKey: isHidden
          ? "community_post_hidden"
          : "community_post_unhidden",
        actionTitle: isHidden
          ? "Community post hidden"
          : "Community post restored",
        description:
          `${isHidden ? "Hid" : "Restored"} community post ${postId}.`,
        targetType: "community_post",
        targetId: postId,
        targetLabel: `Post ${postId}`,
        metadata: {
          postId,
          isHidden,
        },
      });

      res.json({
        success: true,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to update the community post visibility.",
      );
    }
  },
);

export default router;
