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
  getAdminUsersPage,
  setCommunityPostVisibility,
  updateAdminReportStatus,
  updateAdminRoute,
  updateAdminUserRole,
  type AdminUserManagementStatus,
  type AdminUserRestrictionAction,
  type AdminUserRole,
} from "../admin.ts";

import {
  getAdminMapImagesForLocation,
  getAdminMapImagesForProposal,
} from "../adminMapImages.ts";

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

import { publishApprovedMapImageById } from "../mapImagePublishing.ts";

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

// -----------------------------------------------------------------------------
// User Management pagination validation
// -----------------------------------------------------------------------------

const ADMIN_USER_PAGE_SIZES = [
  10,
  25,
  50,
  100,
] as const;

const ADMIN_USER_STATUSES = [
  "all",
  "active",
  "muted",
  "banned",
  "deleted",
] as const;

/**
 * Parses a positive integer from an Express query parameter.
 *
 * Rejects arrays, decimals, negative numbers, zero, and
 * values outside JavaScript's safe integer range.
 */
function parsePositiveIntegerQuery(
  value: unknown,
): number | null {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed)
    ? parsed
    : null;
}

/**
 * Validates the selected page size.
 */
function isAdminUserPageSize(
  value: number,
): value is (typeof ADMIN_USER_PAGE_SIZES)[number] {
  return (
    ADMIN_USER_PAGE_SIZES as readonly number[]
  ).includes(value);
}

/**
 * Validates the status filter.
 *
 * Accepts the frontend's labels case-insensitively:
 * All, Active, Muted, Banned, Deleted.
 */
function parseAdminUserStatus(
  value: unknown,
): AdminUserManagementStatus | null {
  if (value === undefined) {
    return "all";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return (
    ADMIN_USER_STATUSES as readonly string[]
  ).includes(normalized)
    ? normalized as AdminUserManagementStatus
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
// Map-image moderation error handling
// -----------------------------------------------------------------------------

/**
 * Handles SQL errors returned by public.moderate_map_image().
 *
 * The database function remains responsible for authorization,
 * image eligibility, parent eligibility and transactional auditing.
 */
function sendMapImageModerationError(
  res: Response,
  error: unknown,
): void {
  const errorRecord = getRequestBody(error);

  const code = errorRecord?.code;
  const message = errorRecord?.message;

  if (code === "42501") {
    // These two cases are valid administrator requests,
    // but their parent records are not yet eligible for
    // individual image approval.
    if (
      message ===
        "Approve the associated route-change proposal before approving its photographs." ||
      message ===
        "The associated stop or terminal is not approved and publicly available."
    ) {
      res.status(409).json({
        success: false,
        message:
          typeof message === "string"
            ? message
            : "The associated location is not yet eligible for image approval.",
      });

      return;
    }

    res.status(403).json({
      success: false,
      message:
        "You are not authorized to perform this image moderation action.",
    });

    return;
  }

  if (code === "P0002") {
    res.status(404).json({
      success: false,
      message:
        typeof message === "string"
          ? message
          : "The requested image was not found or is no longer available.",
    });

    return;
  }

  if (code === "40001") {
    res.status(409).json({
      success: false,
      message:
        "The image or its associated location changed during moderation. Refresh the review and try again.",
    });

    return;
  }

  if (
    code === "22023" ||
    code === "23514"
  ) {
    res.status(400).json({
      success: false,
      message:
        typeof message === "string"
          ? message
          : "The requested image moderation action is invalid.",
    });

    return;
  }

  sendAdminError(
    res,
    error,
    "Unable to moderate the map image.",
  );
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
// - moderate_map_image
//
// These operations already write their audit records inside the
// same database transaction as the corresponding action.

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
// User Management: paginated account listing
// -----------------------------------------------------------------------------
//
// Supported query parameters:
//
// page       = 1
// pageSize   = 25
// search     = optional search text
// status     = all | active | muted | banned | deleted
//
// The database RPC performs:
//
// - Administrator verification.
// - Server-side search.
// - Server-side status filtering.
// - Exact matching account count.
// - Database-side pagination.
// - Effective ban and mute calculation.
// - Uploaded profile-photo lookup.
//
// The backend resolves public profile-photo URLs using:
//
// profile-photos/{userId}/profile
//
// Google photo metadata is used as a fallback.
//
// The endpoint never exposes usernames as display fields.
// Username is returned internally as searchUsername only.
//

router.get(
  "/users",
  async (req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);

    if (!context) return;

    const rawPage = req.query.page;

    const page =
      rawPage === undefined
        ? 1
        : parsePositiveIntegerQuery(rawPage);

    if (page === null) {
      res.status(400).json({
        success: false,
        message: "Page must be a positive integer.",
      });

      return;
    }

    const rawPageSize = req.query.pageSize;

    const pageSize =
      rawPageSize === undefined
        ? 25
        : parsePositiveIntegerQuery(rawPageSize);

    if (
      pageSize === null ||
      !isAdminUserPageSize(pageSize)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Page size must be 10, 25, 50, or 100.",
      });

      return;
    }

    const rawSearch = req.query.search;

    if (
      rawSearch !== undefined &&
      typeof rawSearch !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "Search must be a single text value.",
      });

      return;
    }

    const search =
      typeof rawSearch === "string"
        ? rawSearch.trim()
        : "";

    if (search.length > 100) {
      res.status(400).json({
        success: false,
        message:
          "Search text cannot exceed 100 characters.",
      });

      return;
    }

    const status = parseAdminUserStatus(
      req.query.status,
    );

    if (status === null) {
      res.status(400).json({
        success: false,
        message:
          "Status must be all, active, muted, banned, or deleted.",
      });

      return;
    }

    try {
      const usersPage = await getAdminUsersPage(
        getSupabaseAdminClient(),
        context.adminUserId,
        {
          page,
          pageSize,
          search,
          status,
        },
      );

      res.json({
        success: true,
        ...usersPage,
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
// Map Images: standalone stop / terminal photographs
// -----------------------------------------------------------------------------
//
// GET /api/admin/map-images/locations/:entityType/:id
//
// The returned records contain:
// - Image metadata.
// - Moderation state.
// - Contributor ID.
// - A short-lived signed URL from private Storage.
//
// Proposal-associated photographs are deliberately excluded.
//
// The authenticated administrator client is used so the existing
// map_images and Storage RLS policies remain active.
//
// Deleted images are omitted from this review response.
//

router.get(
  "/map-images/locations/:entityType/:id",
  async (req: Request, res: Response) => {
    const locationType = req.params.entityType;
    const id = parseRouteId(req.params.id);

    if (
      id === null ||
      (
        locationType !== "terminal" &&
        locationType !== "stop"
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid location type and ID are required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);

    if (!context) return;

    res.setHeader("Cache-Control", "no-store");

    try {
      const images = await getAdminMapImagesForLocation(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        locationType,
        id,
      );

      res.json({
        success: true,
        images,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load the location photographs.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Map Images: route-change proposal photographs
// -----------------------------------------------------------------------------
//
// GET /api/admin/map-images/proposals/:id
//
// Returns photographs specifically attached to the selected
// route-change proposal.
//
// Proposal point order is preserved in the response so the
// frontend can group photographs under their corresponding
// proposed route locations.
//
// Independent photographs attached to existing stops or
// terminals are never included.
//

router.get(
  "/map-images/proposals/:id",
  async (req: Request, res: Response) => {
    const proposalId = parseRouteId(req.params.id);

    if (proposalId === null) {
      res.status(400).json({
        success: false,
        message:
          "A valid route-change proposal ID is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);

    if (!context) return;

    res.setHeader("Cache-Control", "no-store");

    try {
      const images = await getAdminMapImagesForProposal(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        proposalId,
      );

      res.json({
        success: true,
        images,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to load route proposal photographs.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// Map Images: individual image moderation
// -----------------------------------------------------------------------------
//
// POST /api/admin/map-images/:id/moderation
//
// Request:
//
// {
//   "action": "approve" | "reject",
//   "moderation_note": "Optional note"
// }
//
// The database RPC is authoritative for:
// - Administrator authorization.
// - Image ownership and parent association.
// - Pending-image eligibility.
// - Location eligibility.
// - Proposal eligibility.
// - Moderation state updates.
// - Reviewer identity and timestamp.
// - Transactional audit insertion.
//
// Do NOT use the service-role client for this RPC.
// Do NOT insert a separate audit event here.
//
// Public Storage publication is handled separately after
// a successful database approval.
//

router.post(
  "/map-images/:id/moderation",
  async (req: Request, res: Response) => {
    const imageId = parseRouteId(req.params.id);
    const body = getRequestBody(req.body);

    const action = body?.action;
    const moderationNote = body?.moderation_note;

    if (
      imageId === null ||
      !body ||
      (
        action !== "approve" &&
        action !== "reject"
      ) ||
      Object.keys(body).some(
        (key) =>
          !["action", "moderation_note"].includes(key),
      ) ||
      (
        moderationNote !== undefined &&
        moderationNote !== null &&
        (
          typeof moderationNote !== "string" ||
          moderationNote.length > 500
        )
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid image ID, moderation action, and optional moderation note are required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);

    if (!context) return;

    try {
      const { data, error } =
        await getSupabaseClientForAccessToken(
          context.accessToken,
        ).rpc("moderate_map_image", {
          p_image_id: imageId,
          p_action: action,
          p_moderation_note:
            typeof moderationNote === "string"
              ? moderationNote.trim()
              : null,
        });

      if (error) throw error;

      // The authenticated moderation RPC remains authoritative for approval,
      // parent eligibility, reviewer identity, and transactional auditing.
      // Only after it succeeds do we use the privileged server client to copy
      // an approved image to the public bucket and finalize its public path.
      const publication =
        action === "approve"
          ? await publishApprovedMapImageById(
              getSupabaseAdminClient(),
              imageId,
            )
          : null;

      res.setHeader("Cache-Control", "no-store");

      res.json({
        success: true,
        result: data,
        ...(publication ? { publication } : {}),
      });
    } catch (error: unknown) {
      sendMapImageModerationError(res, error);
    }
  },
);

// -----------------------------------------------------------------------------
// Map Images: retry public publication
// -----------------------------------------------------------------------------
//
// POST /api/admin/map-images/:id/publication/retry
//
// This endpoint is protected by the router-wide requireAuth and
// requireAdmin middleware. The publication helper only selects
// already-approved, active images that have not yet been published.
// The database publication RPC revalidates the image and its parent
// before writing public_storage_path.
//
// This is intended for retrying a transient Storage-copy or
// publication-finalization failure. It does not change moderation
// state and does not create another moderation audit event.

router.post(
  "/map-images/:id/publication/retry",
  async (req: Request, res: Response) => {
    const imageId = parseRouteId(req.params.id);
    const context = getVerifiedAdminContext(res);

    if (!context) return;

    if (imageId === null) {
      res.status(400).json({
        success: false,
        message: "A valid map-image ID is required.",
      });
      return;
    }

    res.setHeader("Cache-Control", "no-store");

    try {
      const publication = await publishApprovedMapImageById(
        getSupabaseAdminClient(),
        imageId,
      );

      res.json({
        success: true,
        publication,
      });
    } catch (error: unknown) {
      sendAdminError(
        res,
        error,
        "Unable to retry map-image publication.",
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
