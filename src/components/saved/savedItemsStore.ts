import { createContext, useContext } from "react";

import type { SavedBookmarkIds, SavedKind } from "@/lib/savedItems";

export interface SavedItemsValue {
  userId: string | null;
  bookmarkIds: SavedBookmarkIds;
  loading: boolean;
  error: string | null;
  addBookmark: (kind: SavedKind, targetId: number) => Promise<void>;
  removeBookmark: (kind: SavedKind, targetId: number) => Promise<void>;
}

export const SavedItemsContext = createContext<SavedItemsValue | null>(null);

export function useSavedItems(): SavedItemsValue {
  const value = useContext(SavedItemsContext);
  if (!value) throw new Error("useSavedItems requires SavedItemsProvider.");
  return value;
}
