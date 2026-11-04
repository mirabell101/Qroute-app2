import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  clearRecentSearchesIfUnchanged,
  clearRecentSearches,
  getRecentSearches,
  getRecentSearchesSnapshot,
  recordRecentSearch,
  removeRecentSearch,
} from "@/lib/recentSearches";
import type { RecentSearch, RecentSearchKind } from "@/lib/recentSearches";
import {
  clearRecentSearchesForAccount,
  getRecentSearchesForAccount,
  mergeRecentSearchesForAccount,
  removeRecentSearchForAccount,
} from "@/lib/recentSearchesApi";
import {
  runRecentSearchesAccountMutation,
  mergeRecentSearchHistory,
  syncRecentSearchesForAccount,
} from "@/lib/recentSearchesSync";
import {
  addPendingRecentSearch,
  clearPendingRecentSearchesIfUnchanged,
  getPendingRecentSearchSnapshot,
  getLocalRecentSearchesForAccount,
  RecentSearchesContext,
  removeRecentSearchEntry,
  removePendingRecentSearch,
  resolveRecentSearchNames,
  scopeRecentSearchesState,
  type RecentSearchStoreState,
} from "./recentSearchesStore";

function createAccountSyncApi(expectedUserId: string) {
  return {
    list: () => getRecentSearchesForAccount(expectedUserId),
    merge: (entries: readonly RecentSearch[]) =>
      mergeRecentSearchesForAccount(entries, expectedUserId),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to synchronize recent searches.";
}

function makeStoreState(
  userId: string | null,
  items: RecentSearch[],
  loading: boolean,
  error: string | null = null,
): RecentSearchStoreState {
  return { userId, items, loading, error };
}

export function RecentSearchesProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [state, setState] = useState<RecentSearchStoreState>(() =>
    makeStoreState(
      userId,
      userId ? [] : getRecentSearches(),
      Boolean(userId),
    ),
  );
  const visibleState = scopeRecentSearchesState(state, userId);

  const refreshAccountHistory = useCallback(
    async (localDataChanged = false): Promise<void> => {
      if (!userId) return;
      const entries = await syncRecentSearchesForAccount(
        userId,
        createAccountSyncApi(userId),
        { localDataChanged },
      );
      const items = await resolveRecentSearchNames(
        entries.map((entry) => ({ ...entry, name: "" })),
      );
      setState((current) =>
        current.userId === userId
          ? makeStoreState(userId, items, false)
          : current,
      );
    },
    [userId],
  );

  useEffect(() => {
    let active = true;

    if (!userId) {
      setState(makeStoreState(null, getRecentSearches(), false));
      return () => {
        active = false;
      };
    }

    setState(makeStoreState(userId, [], true));
    void syncRecentSearchesForAccount(
      userId,
      createAccountSyncApi(userId),
    )
      .then(async (entries) =>
        resolveRecentSearchNames(
          entries.map((entry) => ({ ...entry, name: "" })),
        ),
      )
      .then((items) => {
        if (active) setState(makeStoreState(userId, items, false));
      })
      .catch((error: unknown) => {
        if (active) {
          setState(
            makeStoreState(
              userId,
              getLocalRecentSearchesForAccount(userId),
              false,
              getErrorMessage(error),
            ),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const record = useCallback(
    (item: Pick<RecentSearch, "kind" | "targetId" | "name">) => {
      if (!userId) {
        const updated = recordRecentSearch(item);
        setState((current) =>
          current.userId === null
            ? makeStoreState(null, updated, false)
            : current,
        );
        return;
      }

      const pending = { ...item, searchedAt: Date.now() };
      setState((current) =>
        current.userId === userId
          ? makeStoreState(
              userId,
              mergeRecentSearchHistory([...current.items, pending]),
              false,
            )
          : current,
      );
      try {
        addPendingRecentSearch(userId, pending);
      } catch (error: unknown) {
        setState((current) =>
          current.userId === userId
            ? { ...current, error: getErrorMessage(error) }
            : current,
        );
        return;
      }
      void refreshAccountHistory(true).catch((error: unknown) => {
        setState((current) =>
          current.userId === userId
            ? { ...current, error: getErrorMessage(error) }
            : current,
        );
      });
    },
    [refreshAccountHistory, userId],
  );

  const remove = useCallback(
    async (kind: RecentSearchKind, targetId: number): Promise<void> => {
      if (!userId) {
        const items = removeRecentSearch(kind, targetId);
        setState((current) =>
          current.userId === null
            ? makeStoreState(null, items, false)
            : current,
        );
        return;
      }

      try {
        const pending = getPendingRecentSearchSnapshot(userId);
        if (!pending.canClear) {
          throw new Error(
            "Pending recent searches could not be read from this browser.",
          );
        }
        const pendingSearchedAt =
          pending.entries.find(
            (entry) => entry.kind === kind && entry.targetId === targetId,
          )?.searchedAt ?? null;

        await runRecentSearchesAccountMutation(userId, async () => {
          await removeRecentSearchForAccount(kind, targetId, userId);
          removePendingRecentSearch(
            userId,
            kind,
            targetId,
            pendingSearchedAt,
          );
          removeRecentSearch(kind, targetId);
        });
        setState((current) =>
          current.userId === userId
            ? makeStoreState(
                userId,
                removeRecentSearchEntry(current.items, kind, targetId),
                false,
              )
            : current,
        );
      } catch (error: unknown) {
        setState((current) =>
          current.userId === userId
            ? { ...current, error: getErrorMessage(error) }
            : current,
        );
      }
    },
    [userId],
  );

  const clear = useCallback(async (): Promise<void> => {
    if (!userId) {
      clearRecentSearches();
      setState((current) =>
        current.userId === null
          ? makeStoreState(null, [], false)
          : current,
      );
      return;
    }

    try {
      const pending = getPendingRecentSearchSnapshot(userId);
      const guest = getRecentSearchesSnapshot();
      if (!pending.canClear || !guest.canClear) {
        throw new Error("Recent searches could not be cleared in this browser.");
      }

      await runRecentSearchesAccountMutation(userId, async () => {
        await clearRecentSearchesForAccount(userId);
        if (
          clearPendingRecentSearchesIfUnchanged(userId, pending.raw) ===
          "unavailable"
        ) {
          throw new Error(
            "Pending recent searches could not be cleared after account history was cleared.",
          );
        }
        if (clearRecentSearchesIfUnchanged(guest.raw) === "unavailable") {
          throw new Error(
            "Guest recent searches could not be cleared after account history was cleared.",
          );
        }
      });
      setState((current) =>
        current.userId === userId
          ? makeStoreState(userId, [], false)
          : current,
      );
    } catch (error: unknown) {
      setState((current) =>
        current.userId === userId
          ? { ...current, error: getErrorMessage(error) }
          : current,
      );
    }
  }, [userId]);

  const retrySync = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setState((current) =>
      current.userId === userId
        ? { ...current, loading: true, error: null }
        : current,
    );
    try {
      await refreshAccountHistory();
    } catch (error: unknown) {
      setState((current) =>
        current.userId === userId
          ? {
              ...current,
              loading: false,
              error: getErrorMessage(error),
            }
          : current,
      );
    }
  }, [refreshAccountHistory, userId]);

  const value = useMemo(
    () => ({
      ...visibleState,
      record,
      remove,
      clear,
      retrySync,
    }),
    [visibleState, record, remove, clear, retrySync],
  );

  return (
    <RecentSearchesContext.Provider value={value}>
      {children}
    </RecentSearchesContext.Provider>
  );
}
