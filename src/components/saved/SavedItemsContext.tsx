
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
  getSavedBookmarkIds,
  removeSavedBookmark,
  updateSavedBookmarkIds,
} from "@/lib/savedItems";

import type {
  SavedBookmarkIds,
  SavedKind,
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
    bookmarkIds: emptyBookmarkIds,
    loading,
    error: null,
  };
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
   * Asynchronous results from previous identities must
   * never update the current identity's state.
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

    void getSavedBookmarkIds(userId)
      .then((ids) => {
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
            bookmarkIds: ids,
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
            bookmarkIds: emptyBookmarkIds,
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
  }, [userId, sessionGeneration, identityKey]);

  // ==========================================================
  // IDENTITY-SAFE VISIBLE STATE
  // ==========================================================

  /**
   * Hide saved items belonging to another session immediately,
   * without waiting for the loading effect to run.
   */
  const stateMatchesCurrentIdentity =
    state.identityKey === identityKey;

  const bookmarkIds = stateMatchesCurrentIdentity
    ? state.bookmarkIds
    : emptyBookmarkIds;

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

      if (identityRef.current !== operationIdentity) {
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
            true,
          ),
          error: null,
        };
      });
    },
    [userId, sessionGeneration],
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

      if (identityRef.current !== operationIdentity) {
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
    [userId, sessionGeneration],
  );

  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================

  const value = useMemo(
    () => ({
      userId,
      bookmarkIds,
      loading,
      error,
      addBookmark,
      removeBookmark,
    }),
    [
      userId,
      bookmarkIds,
      loading,
      error,
      addBookmark,
      removeBookmark,
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
