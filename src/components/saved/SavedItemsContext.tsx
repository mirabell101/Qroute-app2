import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  addSavedBookmark,
  getSavedBookmarkIds,
  removeSavedBookmark,
  updateSavedBookmarkIds,
} from "@/lib/savedItems";
import type { SavedBookmarkIds, SavedKind } from "@/lib/savedItems";
import { SavedItemsContext } from "./savedItemsStore";

const emptyBookmarkIds: SavedBookmarkIds = {
  routeIds: [],
  stopIds: [],
  terminalIds: [],
};

export function SavedItemsProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [bookmarkIds, setBookmarkIds] = useState(emptyBookmarkIds);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!userId) {
      return () => {
        active = false;
      };
    }

    void getSavedBookmarkIds(userId)
      .then((ids) => {
        if (active) setBookmarkIds(ids);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Unable to load saved items."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const addBookmark = useCallback(
    async (kind: SavedKind, targetId: number) => {
      if (!userId) throw new Error("Sign in to save map information.");
      await addSavedBookmark(userId, kind, targetId);
      setBookmarkIds((current) =>
        updateSavedBookmarkIds(current, kind, targetId, true)
      );
      setError(null);
    },
    [userId]
  );

  const removeBookmark = useCallback(
    async (kind: SavedKind, targetId: number) => {
      if (!userId) throw new Error("Sign in to manage saved items.");
      await removeSavedBookmark(userId, kind, targetId);
      setBookmarkIds((current) =>
        updateSavedBookmarkIds(current, kind, targetId, false)
      );
      setError(null);
    },
    [userId]
  );

  const value = useMemo(
    () => ({
      userId,
      bookmarkIds,
      loading,
      error,
      addBookmark,
      removeBookmark,
    }),
    [userId, bookmarkIds, loading, error, addBookmark, removeBookmark]
  );

  return (
    <SavedItemsContext.Provider value={value}>
      {children}
    </SavedItemsContext.Provider>
  );
}
