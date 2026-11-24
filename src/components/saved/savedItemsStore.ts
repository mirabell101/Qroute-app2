
import { createContext, useContext } from "react";

import type {
  SavedBookmarkIds,
  SavedJourneyEndpoint,
  SavedKind,
  SavedRouteBookmark,
} from "@/lib/savedItems";

// ============================================================
// CONTEXT VALUE
// ============================================================

export interface SavedItemsValue {
  userId: string | null;

  /**
   * Compatibility state for existing bookmark controls.
   *
   * routeIds contains whole-route bookmarks only.
   * Journey bookmarks are represented separately by routeBookmarks.
   */
  bookmarkIds: SavedBookmarkIds;

  /**
   * All saved route records:
   * - Whole-route bookmarks
   * - Journey bookmarks
   *
   * Journey records include their passenger-defined journeyName.
   */
  routeBookmarks: SavedRouteBookmark[];

  loading: boolean;
  error: string | null;

  /**
   * Existing bookmark API.
   *
   * For kind="route", this adds/removes a whole-route bookmark.
   * For kind="stop" or kind="terminal", it manages that individual
   * stop or terminal bookmark.
   */
  addBookmark: (
    kind: SavedKind,
    targetId: number,
  ) => Promise<void>;

  removeBookmark: (
    kind: SavedKind,
    targetId: number,
  ) => Promise<void>;

  /**
   * Adds a passenger-defined journey bookmark.
   *
   * Required information:
   * - Selected route ID
   * - Origin endpoint
   * - Destination endpoint
   * - Passenger-defined journey name
   *
   * Returns the saved_routes bookmark ID.
   *
   * This method is prepared for frontend integration.
   * Do not connect it to a UI action until Phase 3B enables
   * journey records in the database.
   */
  addJourneyBookmark: (
    routeId: number,
    origin: SavedJourneyEndpoint,
    destination: SavedJourneyEndpoint,
    journeyName: string,
  ) => Promise<number>;

  /**
   * Removes one exact route bookmark by its saved_routes ID.
   *
   * This can remove either a whole-route bookmark or a journey
   * bookmark. The database RPC verifies ownership.
   */
  removeRouteBookmark: (
    bookmarkId: number,
  ) => Promise<boolean>;
}

// ============================================================
// CONTEXT
// ============================================================

export const SavedItemsContext =
  createContext<SavedItemsValue | null>(null);

// ============================================================
// HOOK
// ============================================================

export function useSavedItems(): SavedItemsValue {
  const value = useContext(SavedItemsContext);

  if (!value) {
    throw new Error(
      "useSavedItems requires SavedItemsProvider.",
    );
  }

  return value;
}
