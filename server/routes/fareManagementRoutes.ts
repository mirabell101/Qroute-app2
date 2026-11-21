import { Router, type Request, type Response } from "express";

import requireAuth from "../middleware/requireAuth.ts";
import requireAdmin from "../middleware/requireAdmin.ts";

import {
  AdminInputError,
  AdminNotFoundError,
} from "../admin.ts";

import {
  archiveAdminFareDiscount,
  archiveAdminRailFare,
  archiveAdminRoadFareRule,
  getAdminFareManagementData,
  saveAdminFareDiscount,
  saveAdminRailFare,
  saveAdminRoadFareRule,
} from "../adminFareManagement.ts";

import { writeAdminAuditLog } from "../adminAudit.ts";

import {
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";

const router = Router();

router.use(requireAuth, requireAdmin);


// =====================================================
// ADMIN CONTEXT
// =====================================================

function getVerifiedAdminContext(res: Response): {
  accessToken: string;
  adminUserId: string;
} | null {
  const accessToken = res.locals.accessToken;

  const adminUserId = (
    res.locals.user as { id?: unknown } | undefined
  )?.id;

  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    typeof adminUserId !== "string" ||
    !adminUserId
  ) {
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

function parseRecordId(value: string): number | null {
  const id = Number(value);

  return (
    Number.isSafeInteger(id) && id > 0
      ? id
      : null
  );
}


// =====================================================
// ERROR HANDLING
// =====================================================

function sendFareManagementError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
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

  const databaseError = error as {
    code?: unknown;
    message?: unknown;
  };

  if (databaseError?.code === "42501") {
    res.status(403).json({
      success: false,
      message: "Administrator permission is required for this action.",
    });

    return;
  }

  console.error(
    "[fare-management] Request failed:",
    error instanceof Error ? error.message : error,
  );

  res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
}


// =====================================================
// ADMIN AUDIT
// =====================================================

async function recordFareAudit(input: {
  adminUserId: string;
  actionKey: string;
  actionTitle: string;
  description: string;
  targetType: string;
  targetId: number;
  targetLabel: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await writeAdminAuditLog({
      adminUserId: input.adminUserId,
      categoryKey: "fare_management",
      actionKey: input.actionKey,
      actionTitle: input.actionTitle,
      description: input.description,
      targetType: input.targetType,
      targetId: String(input.targetId),
      targetLabel: input.targetLabel,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    // The fare operation has already succeeded.
    // Audit failure must not turn it into an API failure.
    console.error(
      "[fare-management] Audit call failed:",
      error instanceof Error ? error.message : error,
    );
  }
}


// =====================================================
// LOAD ALL FARE MANAGEMENT DATA
// GET /api/admin/fare-management
// =====================================================

router.get("/", async (_req: Request, res: Response) => {
  const context = getVerifiedAdminContext(res);
  if (!context) return;

  try {
    const data = await getAdminFareManagementData(
      getSupabaseClientForAccessToken(
        context.accessToken,
      ),
    );

    res.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    sendFareManagementError(
      res,
      error,
      "Unable to load Fare Management data.",
    );
  }
});


// =====================================================
// ROAD FARE RULES
// =====================================================

// Create a road fare rule and all its distance bands.
router.post(
  "/road-rules",
  async (req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      const id = await saveAdminRoadFareRule(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        null,
        req.body,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "road_fare_rule_created",
        actionTitle: "Road fare rule created",
        description: `Created road fare rule #${id}.`,
        targetType: "fare_rule",
        targetId: id,
        targetLabel: `Road Fare Rule #${id}`,
        metadata: {
          fareRuleId: id,
          operation: "create",
        },
      });

      res.status(201).json({
        success: true,
        id,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to create the road fare rule.",
      );
    }
  },
);


// Update a road fare rule and replace its distance bands atomically.
router.patch(
  "/road-rules/:id",
  async (req: Request, res: Response) => {
    const id = parseRecordId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "A valid road fare rule ID is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      const savedId = await saveAdminRoadFareRule(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        id,
        req.body,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "road_fare_rule_updated",
        actionTitle: "Road fare rule updated",
        description: `Updated road fare rule #${savedId} and its distance bands.`,
        targetType: "fare_rule",
        targetId: savedId,
        targetLabel: `Road Fare Rule #${savedId}`,
        metadata: {
          fareRuleId: savedId,
          operation: "update",
          distanceBandsReplaced: true,
        },
      });

      res.json({
        success: true,
        id: savedId,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to update the road fare rule.",
      );
    }
  },
);


// Archive a road fare rule.
router.patch(
  "/road-rules/:id/archive",
  async (req: Request, res: Response) => {
    const id = parseRecordId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "A valid road fare rule ID is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      await archiveAdminRoadFareRule(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        id,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "road_fare_rule_archived",
        actionTitle: "Road fare rule archived",
        description: `Archived road fare rule #${id}.`,
        targetType: "fare_rule",
        targetId: id,
        targetLabel: `Road Fare Rule #${id}`,
        metadata: {
          fareRuleId: id,
          operation: "archive",
        },
      });

      res.json({
        success: true,
        id,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to archive the road fare rule.",
      );
    }
  },
);


// =====================================================
// FARE DISCOUNTS
// =====================================================

// Create a passenger discount rule.
router.post(
  "/discount-rules",
  async (req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      const id = await saveAdminFareDiscount(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        null,
        req.body,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "fare_discount_created",
        actionTitle: "Fare discount created",
        description: `Created fare discount rule #${id}.`,
        targetType: "fare_discount_rule",
        targetId: id,
        targetLabel: `Fare Discount #${id}`,
        metadata: {
          discountRuleId: id,
          operation: "create",
        },
      });

      res.status(201).json({
        success: true,
        id,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to create the fare discount.",
      );
    }
  },
);


// Update an existing passenger discount rule.
router.patch(
  "/discount-rules/:id",
  async (req: Request, res: Response) => {
    const id = parseRecordId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "A valid fare discount ID is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      const savedId = await saveAdminFareDiscount(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        id,
        req.body,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "fare_discount_updated",
        actionTitle: "Fare discount updated",
        description: `Updated fare discount rule #${savedId}.`,
        targetType: "fare_discount_rule",
        targetId: savedId,
        targetLabel: `Fare Discount #${savedId}`,
        metadata: {
          discountRuleId: savedId,
          operation: "update",
        },
      });

      res.json({
        success: true,
        id: savedId,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to update the fare discount.",
      );
    }
  },
);


// Archive an existing passenger discount rule.
router.patch(
  "/discount-rules/:id/archive",
  async (req: Request, res: Response) => {
    const id = parseRecordId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "A valid fare discount ID is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      await archiveAdminFareDiscount(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        id,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "fare_discount_archived",
        actionTitle: "Fare discount archived",
        description: `Archived fare discount rule #${id}.`,
        targetType: "fare_discount_rule",
        targetId: id,
        targetLabel: `Fare Discount #${id}`,
        metadata: {
          discountRuleId: id,
          operation: "archive",
        },
      });

      res.json({
        success: true,
        id,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to archive the fare discount.",
      );
    }
  },
);


// =====================================================
// TRAIN FARE MATRIX
// =====================================================

// Create one station-pair fare.
router.post(
  "/rail-fares",
  async (req: Request, res: Response) => {
    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      const id = await saveAdminRailFare(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        null,
        req.body,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "rail_fare_created",
        actionTitle: "Train fare created",
        description: `Created train station-pair fare #${id}.`,
        targetType: "rail_fare",
        targetId: id,
        targetLabel: `Train Fare #${id}`,
        metadata: {
          railFareId: id,
          operation: "create",
        },
      });

      res.status(201).json({
        success: true,
        id,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to create the train fare.",
      );
    }
  },
);


// Update one station-pair fare.
router.patch(
  "/rail-fares/:id",
  async (req: Request, res: Response) => {
    const id = parseRecordId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "A valid train fare ID is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      const savedId = await saveAdminRailFare(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        id,
        req.body,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "rail_fare_updated",
        actionTitle: "Train fare updated",
        description: `Updated train station-pair fare #${savedId}.`,
        targetType: "rail_fare",
        targetId: savedId,
        targetLabel: `Train Fare #${savedId}`,
        metadata: {
          railFareId: savedId,
          operation: "update",
        },
      });

      res.json({
        success: true,
        id: savedId,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to update the train fare.",
      );
    }
  },
);


// Archive one station-pair fare.
router.patch(
  "/rail-fares/:id/archive",
  async (req: Request, res: Response) => {
    const id = parseRecordId(req.params.id);

    if (id === null) {
      res.status(400).json({
        success: false,
        message: "A valid train fare ID is required.",
      });

      return;
    }

    const context = getVerifiedAdminContext(res);
    if (!context) return;

    try {
      await archiveAdminRailFare(
        getSupabaseClientForAccessToken(
          context.accessToken,
        ),
        id,
      );

      await recordFareAudit({
        adminUserId: context.adminUserId,
        actionKey: "rail_fare_archived",
        actionTitle: "Train fare archived",
        description: `Archived train station-pair fare #${id}.`,
        targetType: "rail_fare",
        targetId: id,
        targetLabel: `Train Fare #${id}`,
        metadata: {
          railFareId: id,
          operation: "archive",
        },
      });

      res.json({
        success: true,
        id,
      });
    } catch (error: unknown) {
      sendFareManagementError(
        res,
        error,
        "Unable to archive the train fare.",
      );
    }
  },
);

export default router;