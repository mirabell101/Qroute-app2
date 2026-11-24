
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  addSavedBookmark,
  addSavedJourneyBookmark,
  getSavedBookmarks,
  getSavedRouteBookmarks,
  removeSavedBookmark,
  removeSavedRouteBookmark,
  updateSavedBookmarkIds,
} from "@/lib/savedItems";

import type {
  SavedBookmarkIds,
  SavedJourneyEndpoint,
  SavedKind,
  SavedRouteBookmark,
} from "@/lib/savedItems";

import { SavedItemsContext } from "./savedItemsStore";

// ============================================================
// TYPES
// ============================================================

interface SavedItemsProviderProps {
  userId: string | null;
  sessionGeneration?: number | null;
  children: ReactNode;
}

interface SavedItemsState {
  identityKey: string;
  bookmarkIds: SavedBookmarkIds;
  routeBookmarks: SavedRouteBookmark[];
  loading: boolean;
  error: string | null;
}

// ============================================================
// INITIAL STATE
// ============================================================

const emptyBookmarkIds: SavedBookmarkIds = {
  routeIds: [],
  stopIds: [],
  terminalIds: [],
};

/**
 * Creates a unique identity for the current authenticated session.
 *
 * Including sessionGeneration ensures that a new session for the
 * same user is treated as a different identity when necessary.
 */
function createIdentityKey(
  userId: string | null,
  sessionGeneration: number | null,
): string {
  if (!userId) {
    return "anonymous";
  }

  return JSON.stringify([
    userId,
    sessionGeneration,
  ]);
}

function createEmptyState(
  identityKey: string,
  loading: boolean,
): SavedItemsState {
  return {
    identityKey,
    bookmarkIds: {
      routeIds: [],
      stopIds: [],
      terminalIds: [],
    },
    routeBookmarks: [],
    loading,
    error: null,
  };
}

/**
 * Only whole-route bookmarks belong in bookmarkIds.routeIds.
 *
 * Journey bookmarks remain in routeBookmarks so they cannot
 * accidentally be treated as bookmarks for an entire route.
 */
function getWholeRouteIds(
  routeBookmarks: SavedRouteBookmark[],
): number[] {
  return routeBookmarks
    .filter(
      (
        bookmark,
      ): bookmark is Extract<
        SavedRouteBookmark,
        { bookmarkType: "whole_route" }
      > => bookmark.bookmarkType === "whole_route",
    )
    .map((bookmark) => bookmark.routeId);
}

// ============================================================
// PROVIDER
// ============================================================

export function SavedItemsProvider({
  userId,
  sessionGeneration = null,
  children,
}: SavedItemsProviderProps) {
  const identityKey = createIdentityKey(
    userId,
    sessionGeneration,
  );

  const [state, setState] = useState<SavedItemsState>(
    () =>
      createEmptyState(
        identityKey,
        Boolean(userId),
      ),
  );

  /**
   * Always reflects the identity of the current render.
   *
   * Asynchronous results belonging to a previous identity
   * must never update the current identity's state.
   */
  const identityRef = useRef(identityKey);

  identityRef.current = identityKey;

  // ==========================================================
  // LOAD SAVED ITEMS FOR THE CURRENT SESSION
  // ==========================================================

  useEffect(() => {
    let active = true;

    const requestIdentityKey = identityKey;

    setState(
      createEmptyState(
        requestIdentityKey,
        Boolean(userId),
      ),
    );

    if (!userId) {
      return () => {
        active = false;
      };
    }

    void getSavedBookmarks(userId)
      .then((saved) => {
        if (
          !active ||
          identityRef.current !== requestIdentityKey
        ) {
          return;
        }

        setState((current) => {
          if (
            current.identityKey !== requestIdentityKey
          ) {
            return current;
          }

          return {
            identityKey: requestIdentityKey,
            bookmarkIds: saved.bookmarkIds,
            routeBookmarks: saved.routeBookmarks,
            loading: false,
            error: null,
          };
        });
      })
      .catch((cause: unknown) => {
        if (
          !active ||
          identityRef.current !== requestIdentityKey
        ) {
          return;
        }

        setState((current) => {
          if (
            current.identityKey !== requestIdentityKey
          ) {
            return current;
          }

          return {
            ...current,
            bookmarkIds: {
              routeIds: [],
              stopIds: [],
              terminalIds: [],
            },
            routeBookmarks: [],
            loading: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Unable to load saved items.",
          };
        });
      });

    return () => {
      active = false;
    };
  }, [
    userId,
    sessionGeneration,
    identityKey,
  ]);

  // ==========================================================
  // REFRESH ROUTE BOOKMARKS
  // ==========================================================

  /**
   * Reloads all saved route records after a route bookmark
   * mutation.
   *
   * This retrieves the actual database records, including:
   * - Whole-route bookmarks
   * - Journey bookmark IDs
   * - Passenger-defined journey names
   * - Journey endpoints
   * - Creation timestamps
   *
   * We refresh instead of constructing incomplete bookmark
   * objects locally.
   *
   * Identity checks prevent a refresh from an old session
   * from modifying the current session's state.
   */
  const refreshRouteBookmarks = useCallback(
    async (
      operationIdentity: string,
    ): Promise<void> => {
      if (!userId) {
        return;
      }

      const routeBookmarks =
        await getSavedRouteBookmarks(userId);

      if (
        identityRef.current !== operationIdentity
      ) {
        return;
      }

      setState((current) => {
        if (
          current.identityKey !== operationIdentity
        ) {
          return current;
        }

        return {
          ...current,

          bookmarkIds: {
            ...current.bookmarkIds,

            routeIds: getWholeRouteIds(
              routeBookmarks,
            ),
          },

          routeBookmarks,
          error: null,
        };
      });
    },
    [userId],
  );

  // ==========================================================
  // IDENTITY-SAFE VISIBLE STATE
  // ==========================================================

  /**
   * Hide saved items belonging to another session immediately,
   * without waiting for the loading effect to execute.
   */
  const stateMatchesCurrentIdentity =
    state.identityKey === identityKey;

  const bookmarkIds = stateMatchesCurrentIdentity
    ? state.bookmarkIds
    : emptyBookmarkIds;

  const routeBookmarks = stateMatchesCurrentIdentity
    ? state.routeBookmarks
    : [];

  const loading = userId
    ? !stateMatchesCurrentIdentity || state.loading
    : false;

  const error = stateMatchesCurrentIdentity
    ? state.error
    : null;

  // ==========================================================
  // ADD BOOKMARK
  // ==========================================================

  const addBookmark = useCallback(
    async (
      kind: SavedKind,
      targetId: number,
    ): Promise<void> => {
      if (!userId) {
        throw new Error(
          "Sign in to save map information.",
        );
      }

      const operationIdentity = createIdentityKey(
        userId,
        sessionGeneration,
      );

      await addSavedBookmark(
        userId,
        kind,
        targetId,
      );

      if (
        identityRef.current !== operationIdentity
      ) {
        return;
      }

      // Whole-route bookmarks are stored in saved_routes.
      // Refresh complete records instead of updating routeIds
      // without their corresponding bookmark information.
      if (kind === "route") {
        await refreshRouteBookmarks(
          operationIdentity,
        );

        return;
      }

      // Individual stops and terminals remain independent
      // bookmarks in their existing tables.
      setState((current) => {
        if (
          current.identityKey !== operationIdentity
        ) {
          return current;
        }

        return {
          ...current,

          bookmarkIds: updateSavedBookmarkIds(
            current.bookmarkIds,
            kind,
            targetId,
            true,
          ),

          error: null,
        };
      });
    },
    [
      userId,
      sessionGeneration,
      refreshRouteBookmarks,
    ],
  );

  // ==========================================================
  // REMOVE BOOKMARK
  // ==========================================================

  const removeBookmark = useCallback(
    async (
      kind: SavedKind,
      targetId: number,
    ): Promise<void> => {
      if (!userId) {
        throw new Error(
          "Sign in to manage saved items.",
        );
      }

      const operationIdentity = createIdentityKey(
        userId,
        sessionGeneration,
      );

      await removeSavedBookmark(
        userId,
        kind,
        targetId,
      );

      if (
        identityRef.current !== operationIdentity
      ) {
        return;
      }

      // The route compatibility method removes only the
      // whole-route bookmark, never a journey bookmark.
      if (kind === "route") {
        await refreshRouteBookmarks(
          operationIdentity,
        );

        return;
      }

      setState((current) => {
        if (
          current.identityKey !== operationIdentity
        ) {
          return current;
        }

        return {
          ...current,

          bookmarkIds: updateSavedBookmarkIds(
            current.bookmarkIds,
            kind,
            targetId,
            false,
          ),

          error: null,
        };
      });
    },
    [
      userId,
      sessionGeneration,
      refreshRouteBookmarks,
    ],
  );

  // ==========================================================
  // ADD JOURNEY BOOKMARK
  // ==========================================================

  /**
   * Creates a passenger-defined saved journey.
   *
   * Required information:
   * - Selected public transit route
   * - Exactly one origin
   * - Exactly one destination
   * - Passenger-defined journey name
   *
   * The name is validated and normalized in savedItems.ts.
   *
   * IMPORTANT:
   * The database still has the temporary
   * saved_routes_journeys_disabled_check constraint.
   *
   * This method is prepared for the frontend integration,
   * but journey insertion will remain blocked by the database
   * until Phase 3B is completed.
   */
  const addJourneyBookmark = useCallback(
    async (
      routeId: number,
      origin: SavedJourneyEndpoint,
      destination: SavedJourneyEndpoint,
      journeyName: string,
    ): Promise<number> => {
      if (!userId) {
        throw new Error(
          "Sign in to save a journey.",
        );
      }

      const operationIdentity = createIdentityKey(
        userId,
        sessionGeneration,
      );

      const bookmarkId =
        await addSavedJourneyBookmark(
          userId,
          routeId,
          origin,
          destination,
          journeyName,
        );

      if (
        identityRef.current !== operationIdentity
      ) {
        return bookmarkId;
      }

      // Reload the complete records so the context receives
      // the authoritative journey name, ID, and endpoints.
      await refreshRouteBookmarks(
        operationIdentity,
      );

      return bookmarkId;
    },
    [
      userId,
      sessionGeneration,
      refreshRouteBookmarks,
    ],
  );

  // ==========================================================
  // REMOVE EXACT ROUTE BOOKMARK BY BOOKMARK ID
  // ==========================================================

  /**
   * Removes one exact saved_routes record.
   *
   * Unlike removeBookmark("route", routeId), this method
   * can remove an individual journey bookmark because it
   * uses the bookmark's own database ID.
   *
   * Ownership is checked by the database RPC using auth.uid().
   */
  const removeRouteBookmark = useCallback(
    async (
      bookmarkId: number,
    ): Promise<boolean> => {
      if (!userId) {
        throw new Error(
          "Sign in to manage saved items.",
        );
      }

      const operationIdentity = createIdentityKey(
        userId,
        sessionGeneration,
      );

      const removed =
        await removeSavedRouteBookmark(
          userId,
          bookmarkId,
        );

      if (
        !removed ||
        identityRef.current !== operationIdentity
      ) {
        return removed;
      }

      await refreshRouteBookmarks(
        operationIdentity,
      );

      return true;
    },
    [
      userId,
      sessionGeneration,
      refreshRouteBookmarks,
    ],
  );

  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================

  const value = useMemo(
    () => ({
      userId,
      bookmarkIds,
      routeBookmarks,
      loading,
      error,

      addBookmark,
      removeBookmark,

      addJourneyBookmark,
      removeRouteBookmark,
    }),
    [
      userId,
      bookmarkIds,
      routeBookmarks,
      loading,
      error,

      addBookmark,
      removeBookmark,

      addJourneyBookmark,
      removeRouteBookmark,
    ],
  );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <SavedItemsContext.Provider value={value}>
      {children}
    </SavedItemsContext.Provider>
  );
}
