import { Router, type Request, type Response } from "express";
import requireAuth from "../middleware/requireAuth.ts";
import {
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";
import {
  mergeRecentSearches,
  parseRecentSearchEntries,
  type RecentSearchItemType,
} from "../recentSearches.ts";

const router = Router();

function sendDatabaseError(res: Response, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "Unknown database error";
  console.error("[recent-searches] Database request failed:", message);
  res.status(500).json({
    success: false,
    message: "Unable to complete the Recent Searches request.",
  });
}

function isItemType(value: string): value is RecentSearchItemType {
  return value === "route" || value === "stop" || value === "terminal";
}

router.use(requireAuth);

router.get("/", async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseClientForAccessToken(
      res.locals.accessToken as string,
    );
    const items = await mergeRecentSearches(supabase, []);
    res.json({ success: true, items });
  } catch (error: unknown) {
    sendDatabaseError(res, error);
  }
});

router.post("/merge", async (req: Request, res: Response) => {
  if (!Array.isArray(req.body?.entries)) {
    res.status(400).json({
      success: false,
      message: "Recent search entries must be an array.",
    });
    return;
  }

  const entries = parseRecentSearchEntries(req.body.entries, Date.now());
  try {
    const supabase = getSupabaseClientForAccessToken(
      res.locals.accessToken as string,
    );
    const items = await mergeRecentSearches(supabase, entries);
    res.json({ success: true, items });
  } catch (error: unknown) {
    sendDatabaseError(res, error);
  }
});

router.delete("/:itemType/:itemId", async (req: Request, res: Response) => {
  const { itemType, itemId: rawItemId } = req.params;
  if (!isItemType(itemType) || !/^[1-9]\d*$/.test(rawItemId)) {
    res.status(400).json({
      success: false,
      message: "Choose a valid recent search.",
    });
    return;
  }
  const itemId = Number(rawItemId);
  if (!Number.isSafeInteger(itemId)) {
    res.status(400).json({
      success: false,
      message: "Choose a valid recent search.",
    });
    return;
  }

  const user = res.locals.user as { id: string };
  try {
    const { error } = await getSupabaseClientForAccessToken(
      res.locals.accessToken as string,
    )
      .from("recent_searches")
      .delete()
      .eq("user_id", user.id)
      .eq("item_type", itemType)
      .eq("item_id", itemId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    sendDatabaseError(res, error);
  }
});

router.delete("/", async (_req: Request, res: Response) => {
  const user = res.locals.user as { id: string };
  try {
    const { error } = await getSupabaseClientForAccessToken(
      res.locals.accessToken as string,
    )
      .from("recent_searches")
      .delete()
      .eq("user_id", user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: unknown) {
    sendDatabaseError(res, error);
  }
});

export default router;
