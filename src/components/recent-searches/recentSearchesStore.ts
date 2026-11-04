import { createContext, useContext } from "react";
import {
  getRecentSearches,
  normalizeRecentSearchHistory,
} from "@/lib/recentSearches";
import type { RecentSearch, RecentSearchKind } from "@/lib/recentSearches";
import { getRouteMapIndex } from "@/lib/routes";
import { getTerminals } from "@/lib/terminals";

const pendingStoragePrefix = "qroute_recent_searches_pending:";

export interface RecentSearchStoreState {
  userId: string | null;
  items: RecentSearch[];
  loading: boolean;
  error: string | null;
}

export interface RecentSearchesContextValue extends RecentSearchStoreState {
  record: (
    item: Pick<RecentSearch, "kind" | "targetId" | "name">,
  ) => void;
  remove: (kind: RecentSearchKind, targetId: number) => Promise<void>;
  clear: () => Promise<void>;
  retrySync: () => Promise<void>;
}

export function removeRecentSearchEntry(
  entries: readonly RecentSearch[],
  kind: RecentSearchKind,
  targetId: number,
): RecentSearch[] {
  return entries.filter(
    (entry) => entry.kind !== kind || entry.targetId !== targetId,
  );
}

export const RecentSearchesContext =
  createContext<RecentSearchesContextValue | null>(null);

export function useRecentSearches(): RecentSearchesContextValue {
  const value = useContext(RecentSearchesContext);
  if (!value) {
    throw new Error(
      "useRecentSearches requires RecentSearchesProvider.",
    );
  }
  return value;
}

export async function resolveRecentSearchNames(
  entries: RecentSearch[],
): Promise<RecentSearch[]> {
  const needsRouteMap = entries.some(
    ({ kind }) => kind === "route" || kind === "stop",
  );
  const needsTerminals = entries.some(({ kind }) => kind === "terminal");
  const [routeMap, terminals] = await Promise.all([
    needsRouteMap
      ? getRouteMapIndex().catch((error: unknown) => {
          console.error("Could not resolve recent route and stop names.", error);
          return null;
        })
      : Promise.resolve(null),
    needsTerminals
      ? getTerminals().catch((error: unknown) => {
          console.error("Could not resolve recent terminal names.", error);
          return [];
        })
      : Promise.resolve([]),
  ]);

  return entries.map((entry) => {
    const name =
      entry.kind === "route"
        ? routeMap?.routes.find((route) => route.id === entry.targetId)?.name
        : entry.kind === "stop"
          ? routeMap?.points.find(
              (point) =>
                point.kind === "stop" && point.ref_id === entry.targetId,
            )?.name
          : terminals.find((terminal) => terminal.id === entry.targetId)?.name;
    return { ...entry, name: name ?? `Unavailable ${entry.kind}` };
  });
}

export interface PendingRecentSearchSnapshot {
  entries: RecentSearch[];
  raw: string | null;
  canClear: boolean;
}

export type ClearPendingSnapshotResult =
  | "cleared"
  | "changed"
  | "unavailable";

export function getPendingRecentSearchKey(userId: string): string {
  return `${pendingStoragePrefix}${encodeURIComponent(userId)}`;
}

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    console.warn("Could not access pending recent searches in localStorage.", error);
    return null;
  }
}

function warnStorageFailure(action: string, error: unknown): void {
  console.warn(
    `Could not ${action} pending recent searches in localStorage.`,
    error,
  );
}

function parsePendingHistory(raw: string | null, now: number): RecentSearch[] {
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("Ignoring malformed pending recent search history.");
      return [];
    }
    return normalizeRecentSearchHistory(parsed, now);
  } catch (error) {
    warnStorageFailure("parse", error);
    return [];
  }
}

export function getPendingRecentSearchSnapshot(
  userId: string,
  now = Date.now(),
): PendingRecentSearchSnapshot {
  const storage = getStorage();
  if (!storage) return { entries: [], raw: null, canClear: false };

  const key = getPendingRecentSearchKey(userId);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    warnStorageFailure("read", error);
    return { entries: [], raw: null, canClear: false };
  }

  return { entries: parsePendingHistory(raw, now), raw, canClear: true };
}

export function addPendingRecentSearch(
  userId: string,
  item: RecentSearch,
  now = Date.now(),
): RecentSearch[] {
  const snapshot = getPendingRecentSearchSnapshot(userId, now);
  if (!snapshot.canClear) {
    throw new Error("Pending recent searches cannot be read from this browser.");
  }
  const entries = normalizeRecentSearchHistory(
    [...snapshot.entries, item],
    now,
  );
  const storage = getStorage();
  if (!storage) {
    throw new Error("Pending recent searches cannot be saved in this browser.");
  }

  try {
    storage.setItem(
      getPendingRecentSearchKey(userId),
      JSON.stringify(entries),
    );
    return entries;
  } catch (error) {
    warnStorageFailure("write", error);
    throw error;
  }
}

export function getPendingRecentSearches(
  userId: string,
  now = Date.now(),
): RecentSearch[] {
  return getPendingRecentSearchSnapshot(userId, now).entries;
}

export function removePendingRecentSearch(
  userId: string,
  kind: RecentSearchKind,
  targetId: number,
  expectedSearchedAt: number | null,
  now = Date.now(),
): RecentSearch[] {
  const snapshot = getPendingRecentSearchSnapshot(userId, now);
  if (!snapshot.canClear) {
    throw new Error("Pending recent searches cannot be read from this browser.");
  }
  const entries = snapshot.entries.filter(
    (entry) =>
      entry.kind !== kind ||
      entry.targetId !== targetId ||
      expectedSearchedAt === null ||
      entry.searchedAt !== expectedSearchedAt,
  );
  writePendingRecentSearches(userId, entries);
  return entries;
}

export function clearPendingRecentSearches(userId: string): void {
  const storage = getStorage();
  if (!storage) {
    throw new Error("Pending recent searches cannot be cleared in this browser.");
  }
  try {
    storage.removeItem(getPendingRecentSearchKey(userId));
  } catch (error) {
    warnStorageFailure("clear", error);
    throw error;
  }
}

export function clearPendingRecentSearchesIfUnchanged(
  userId: string,
  expectedRaw: string | null,
): ClearPendingSnapshotResult {
  const storage = getStorage();
  if (!storage) return "unavailable";

  const key = getPendingRecentSearchKey(userId);
  let current: string | null;
  try {
    current = storage.getItem(key);
  } catch (error) {
    warnStorageFailure("read", error);
    return "unavailable";
  }
  if (current !== expectedRaw) return "changed";

  try {
    storage.removeItem(key);
    return "cleared";
  } catch (error) {
    warnStorageFailure("clear", error);
    return "unavailable";
  }
}

export function writePendingRecentSearches(
  userId: string,
  entries: RecentSearch[],
): void {
  const storage = getStorage();
  if (!storage) {
    throw new Error("Pending recent searches cannot be saved in this browser.");
  }
  try {
    if (entries.length === 0) {
      storage.removeItem(getPendingRecentSearchKey(userId));
    } else {
      storage.setItem(
        getPendingRecentSearchKey(userId),
        JSON.stringify(normalizeRecentSearchHistory(entries)),
      );
    }
  } catch (error) {
    warnStorageFailure("write", error);
    throw error;
  }
}

export function getLocalRecentSearchesForAccount(
  userId: string,
  now = Date.now(),
): RecentSearch[] {
  return normalizeRecentSearchHistory(
    [
      ...getRecentSearches(),
      ...getPendingRecentSearches(userId, now),
    ],
    now,
  );
}

export function scopeRecentSearchesState(
  state: RecentSearchStoreState,
  userId: string | null,
): RecentSearchStoreState {
  return state.userId === userId
    ? state
    : { userId, items: [], loading: Boolean(userId), error: null };
}
