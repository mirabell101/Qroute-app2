import { Router, type Request, type Response } from "express";

import { getAdminRouteManagementData } from "../admin.ts";
import requireAdmin from "../middleware/requireAdmin.ts";
import requireAuth from "../middleware/requireAuth.ts";
import requireRouteReviewer from "../middleware/requireRouteReviewer.ts";
import {
  getSupabaseAdminClient,
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";

import {
  publishApprovedMapImagesForLocation,
  publishApprovedMapImagesForProposal,
} from "../mapImagePublishing.ts";

const router = Router();

const entityTypes = ["route", "stop", "terminal"] as const;
type EntityType = (typeof entityTypes)[number];

const moderationActions = [
  "approve",
  "reject",
  "mute",
  "unmute",
  "ban",
  "unban",
] as const;
type ModerationAction = (typeof moderationActions)[number];

const routeChangeProposalActions = ["approve", "reject"] as const;
type RouteChangeProposalAction = (typeof routeChangeProposalActions)[number];

function getAccessToken(res: Response): string | null {
  const token = res.locals.accessToken;
  return typeof token === "string" && token ? token : null;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseEntityType(value: string): EntityType | null {
  return entityTypes.includes(value as EntityType)
    ? (value as EntityType)
    : null;
}

function isModerationAction(value: unknown): value is ModerationAction {
  return (
    typeof value === "string" &&
    moderationActions.some((action) => action === value)
  );
}

function isRouteChangeProposalAction(
  value: unknown,
): value is RouteChangeProposalAction {
  return (
    typeof value === "string" &&
    routeChangeProposalActions.some((action) => action === value)
  );
}

function getObjectBody(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? (value as Record<string, unknown>)
    : null;
}

function filterPayload(
  body: Record<string, unknown>,
  allowedFields: readonly string[],
): Record<string, unknown> | null {
  const keys = Object.keys(body);
  if (
    keys.length === 0 ||
    keys.some((key) => !allowedFields.includes(key))
  ) {
    return null;
  }
  return body;
}

function sendError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): void {
  const errorRecord = getObjectBody(error);
  const code = errorRecord?.code;
  const message = errorRecord?.message;
  const details = errorRecord?.details;

  if (code === "42501") {
    res.status(403).json({
      success: false,
      message: "You are not authorized to perform this action.",
    });
    return;
  }

  // A proposal may become stale after submission (for example, a shared
  // stop/terminal was edited or the route sequence changed). The database
  // raises SQLSTATE 40001 for these approval-time conflicts.
  if (code === "40001") {
    res.status(409).json({
      success: false,
      message:
        "This proposal conflicts with the current route or one of its shared locations. Refresh Route Management and review the proposal before trying again.",
    });
    return;
  }

  if (
    code === "P0001" &&
    message === "route_management_shared_pending_point"
  ) {
    let conflict: Record<string, unknown> | null = null;

    if (typeof details === "string") {
      try {
        conflict = getObjectBody(JSON.parse(details) as unknown);
      } catch {
        conflict = null;
      }
    }

    const pointType =
      typeof conflict?.pointType === "string"
        ? conflict.pointType
        : "point";
    const pointName =
      typeof conflict?.pointName === "string"
        ? ` "${conflict.pointName}"`
        : "";
    const routes = Array.isArray(conflict?.routes)
      ? conflict.routes
          .filter(
            (
              route,
            ): route is { id: number; name: string } =>
              route !== null &&
              typeof route === "object" &&
              "id" in route &&
              typeof route.id === "number" &&
              "name" in route &&
              typeof route.name === "string",
          )
          .map((route) => `${route.name} (ID ${route.id})`)
      : [];
    const routeDetails = routes.length
      ? routes.join(", ")
      : "another route";

    res.status(409).json({
      success: false,
      message:
        `Cannot approve this route: pending ${pointType}` +
        `${pointName} is also linked to ${routeDetails}.`,
    });
    return;
  }

  if (code === "P0002") {
    res.status(404).json({
      success: false,
      message:
        "The requested record was not found or is no longer pending.",
    });
    return;
  }

  if (
    code === "P0001" ||
    code === "22P02" ||
    code === "22023" ||
    code === "23502" ||
    code === "23503" ||
    code === "23514"
  ) {
    res.status(400).json({
      success: false,
      message: "The requested Route Management change is invalid.",
    });
    return;
  }

  console.error("[routeManagement] Request failed:", error);
  res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
}

async function callManagementRpc(
  res: Response,
  entityType: string,
  action: string,
  entityId: number | null,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  const accessToken = getAccessToken(res);
  if (!accessToken) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return null;
  }

  const { data, error } = await getSupabaseClientForAccessToken(
    accessToken,
  ).rpc("manage_transit_record", {
    p_entity_type: entityType,
    p_action: action,
    p_entity_id: entityId,
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}

router.use(requireAuth, requireRouteReviewer);

// ============================================================
// ROUTE MANAGEMENT DATA
// ============================================================

router.get("/", async (_req: Request, res: Response) => {
  const accessToken = getAccessToken(res);
  if (!accessToken) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
    return;
  }

  try {
    const records = await getAdminRouteManagementData(
      getSupabaseClientForAccessToken(accessToken),
    );

    // The data loader returns the complete proposal format, including
    // combined proposals, removals, replacements, proposed order, point
    // edits, and contributor remarks. Keep the API response transparent so
    // the reviewer UI receives the database-backed proposal details intact.
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      records,
    });
  } catch (error: unknown) {
    sendError(
      res,
      error,
      "Unable to load Route Management records.",
    );
  }
});

// ============================================================
// EXISTING ROUTE / STOP / TERMINAL MODERATION
// ============================================================

router.post(
  "/moderation/:entityType/:id",
  async (req: Request, res: Response) => {
    const entityType = parseEntityType(req.params.entityType);
    const id = parseId(req.params.id);
    const body = getObjectBody(req.body);
    const action = body?.action;
    const moderationNote = body?.moderation_note;

    if (
      !entityType ||
      id === null ||
      !isModerationAction(action) ||
      Object.keys(body ?? {}).some(
        (key) => !["action", "moderation_note"].includes(key),
      ) ||
      (
        moderationNote !== undefined &&
        (
          typeof moderationNote !== "string" ||
          moderationNote.length > 500
        )
      )
    ) {
      res.status(400).json({
        success: false,
        message: "A valid moderation action and record are required.",
      });
      return;
    }

    try {
      const result = await callManagementRpc(
        res,
        entityType,
        action,
        id,
        {
          ...(action === "reject"
            ? { moderation_note: moderationNote ?? "" }
            : {}),
        },
      );

      // A stop/terminal approval can automatically approve its directly
      // attached pending photographs through the existing database trigger.
      // Publish those photographs only after the moderation transaction has
      // succeeded. Proposal-specific photographs are published by the
      // proposal moderation handler below, not by this location handler.
      const publication =
        action === "approve" &&
        (entityType === "stop" || entityType === "terminal")
          ? await publishApprovedMapImagesForLocation(
              getSupabaseAdminClient(),
              entityType,
              id,
            )
          : null;

      if (!res.headersSent) {
        res.json({
          success: true,
          result,
          ...(publication ? { publication } : {}),
        });
      }
    } catch (error: unknown) {
      sendError(
        res,
        error,
        "Unable to moderate the pending contribution.",
      );
    }
  },
);

// ============================================================
// ROUTE CHANGE PROPOSAL MODERATION
// ============================================================

router.post(
  "/proposals/:id/moderation",
  async (req: Request, res: Response) => {
    const proposalId = parseId(req.params.id);
    const body = getObjectBody(req.body);
    const action = body?.action;
    const moderationNote = body?.moderation_note;

    if (
      proposalId === null ||
      !isRouteChangeProposalAction(action) ||
      Object.keys(body ?? {}).some(
        (key) => !["action", "moderation_note"].includes(key),
      ) ||
      (
        moderationNote !== undefined &&
        (
          typeof moderationNote !== "string" ||
          moderationNote.length > 500
        )
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid route change proposal id and moderation action are required.",
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
      const { data, error } = await getSupabaseClientForAccessToken(
        accessToken,
      ).rpc("moderate_route_change_proposal", {
        p_proposal_id: proposalId,
        p_action: action,
        p_moderation_note:
          typeof moderationNote === "string"
            ? moderationNote.trim()
            : "",
      });

      if (error) throw error;

      // The proposal RPC and its triggers approve/reject proposal-owned
      // photographs transactionally. Only after it returns an approved
      // proposal do we copy those approved files into the public bucket.
      const proposalWasApproved =
        data !== null &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        "status" in data &&
        data.status === "approved";

      const publication =
        action === "approve" && proposalWasApproved
          ? await publishApprovedMapImagesForProposal(
              getSupabaseAdminClient(),
              proposalId,
            )
          : null;

      res.json({
        success: true,
        result: data,
        ...(publication ? { publication } : {}),
      });
    } catch (error: unknown) {
      sendError(
        res,
        error,
        "Unable to moderate the route change proposal.",
      );
    }
  },
);

// ============================================================
// ADMIN-ONLY ROUTE / STOP / TERMINAL RECORD UPDATES
// ============================================================

router.patch(
  "/records/:entityType/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    const entityType = parseEntityType(req.params.entityType);
    const id = parseId(req.params.id);
    const body = getObjectBody(req.body);

    const allowedFields =
      entityType === "route"
        ? [
            "name",
            "transport_type_id",
            "variant_id",
            "is_active",
            "stops",
          ]
        : entityType === "stop"
          ? [
              "name",
              "description",
              "stop_type",
              "latitude",
              "longitude",
              "transport_type_id",
              "is_active",
            ]
          : [
              "name",
              "latitude",
              "longitude",
              "transport_type_id",
              "is_active",
            ];

    const payload = body ? filterPayload(body, allowedFields) : null;

    if (!entityType || id === null || !payload) {
      res.status(400).json({
        success: false,
        message:
          "A valid record id and update payload are required.",
      });
      return;
    }

    try {
      const result = await callManagementRpc(
        res,
        entityType,
        "update",
        id,
        payload,
      );

      if (!res.headersSent) {
        res.json({
          success: true,
          result,
        });
      }
    } catch (error: unknown) {
      sendError(
        res,
        error,
        "Unable to update the Route Management record.",
      );
    }
  },
);

router.delete(
  "/records/:entityType/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    const entityType = parseEntityType(req.params.entityType);
    const id = parseId(req.params.id);

    if (!entityType || id === null) {
      res.status(400).json({
        success: false,
        message: "A valid record type and id are required.",
      });
      return;
    }

    try {
      const result = await callManagementRpc(
        res,
        entityType,
        "archive",
        id,
      );

      if (!res.headersSent) {
        res.json({
          success: true,
          result,
        });
      }
    } catch (error: unknown) {
      sendError(
        res,
        error,
        "Unable to archive the Route Management record.",
      );
    }
  },
);

// ============================================================
// ADMIN-ONLY TRANSPORT TYPE MANAGEMENT
// ============================================================

router.post(
  "/transport-types",
  requireAdmin,
  async (req: Request, res: Response) => {
    const body = getObjectBody(req.body);
    const payload = body ? filterPayload(body, ["name", "color"]) : null;
    const name = payload?.name;
    const color = payload?.color;

    if (
      !payload ||
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.trim().length > 80 ||
      typeof color !== "string" ||
      !/^#[0-9A-Fa-f]{3,8}$/.test(color)
    ) {
      res.status(400).json({
        success: false,
        message: "A valid Transport Type name and color are required.",
      });
      return;
    }

    try {
      const result = await callManagementRpc(
        res,
        "transport_type",
        "create",
        null,
        {
          name: name.trim(),
          color,
        },
      );

      if (!res.headersSent) {
        res.status(201).json({
          success: true,
          result,
        });
      }
    } catch (error: unknown) {
      sendError(
        res,
        error,
        "Unable to create the Transport Type.",
      );
    }
  },
);

router.patch(
  "/transport-types/:id",
  requireAdmin,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const body = getObjectBody(req.body);
    const payload = body ? filterPayload(body, ["name", "color"]) : null;
    const name = payload?.name;
    const color = payload?.color;

    if (
      id === null ||
      !payload ||
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.trim().length > 80 ||
      typeof color !== "string" ||
      !/^#[0-9A-Fa-f]{3,8}$/.test(color)
    ) {
      res.status(400).json({
        success: false,
        message:
          "A valid Transport Type id, name, and color are required.",
      });
      return;
    }

    try {
      const result = await callManagementRpc(
        res,
        "transport_type",
        "update",
        id,
        {
          name: name.trim(),
          color,
        },
      );

      if (!res.headersSent) {
        res.json({
          success: true,
          result,
        });
      }
    } catch (error: unknown) {
      sendError(
        res,
        error,
        "Unable to update the Transport Type.",
      );
    }
  },
);

export default router;
