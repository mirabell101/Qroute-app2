import {
  clearRecentSearchesIfUnchanged,
  getRecentSearchesSnapshot,
  normalizeRecentSearchHistory,
} from "./recentSearches";
import type { RecentSearch } from "./recentSearches";
import type { RecentSearchApiEntry } from "./recentSearchesApi";
import {
  clearPendingRecentSearchesIfUnchanged,
  getPendingRecentSearchSnapshot,
} from "@/components/recent-searches/recentSearchesStore";

export interface RecentSearchesSyncApi {
  list(): Promise<RecentSearchApiEntry[]>;
  merge(entries: readonly RecentSearch[]): Promise<RecentSearchApiEntry[]>;
}

interface ActiveSync {
  promise: Promise<RecentSearchApiEntry[]>;
  rerun: boolean;
  generation: number;
}

const activeSyncs = new Map<string, ActiveSync>();
const accountOperationTails = new Map<string, Promise<void>>();
const accountGenerations = new Map<string, number>();

function getAccountGeneration(userId: string): number {
  return accountGenerations.get(userId) ?? 0;
}

function enqueueAccountOperation<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = accountOperationTails.get(userId) ?? Promise.resolve();
  const task = previous.then(operation, operation);
  const tail = task.then(
    () => undefined,
    () => undefined,
  );
  accountOperationTails.set(userId, tail);
  void tail.then(() => {
    if (accountOperationTails.get(userId) === tail) {
      accountOperationTails.delete(userId);
    }
  });
  return task;
}

export function runRecentSearchesAccountMutation<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  accountGenerations.set(userId, getAccountGeneration(userId) + 1);
  return enqueueAccountOperation(userId, operation);
}

export function mergeRecentSearchHistory(
  entries: readonly RecentSearch[],
  now = Date.now(),
): RecentSearch[] {
  return normalizeRecentSearchHistory([...entries], now);
}

export function syncRecentSearchesForAccount(
  userId: string,
  api: RecentSearchesSyncApi,
  options: { now?: number; localDataChanged?: boolean } = {},
): Promise<RecentSearchApiEntry[]> {
  const generation = getAccountGeneration(userId);
  const active = activeSyncs.get(userId);
  if (active && active.generation === generation) {
    if (options.localDataChanged) active.rerun = true;
    return active.promise;
  }

  const current: ActiveSync = {
    promise: Promise.resolve([]),
    rerun: false,
    generation,
  };
  const task = enqueueAccountOperation(userId, async () => {
    let remoteEntries: RecentSearchApiEntry[];

    do {
      current.rerun = false;
      const now = options.now ?? Date.now();
      const guest = getRecentSearchesSnapshot(now);
      const pending = getPendingRecentSearchSnapshot(userId, now);
      const outgoing = mergeRecentSearchHistory(
        [...guest.entries, ...pending.entries],
        now,
      );

      remoteEntries = outgoing.length
        ? await api.merge(outgoing)
        : await api.list();

      if (guest.canClear) {
        const result = clearRecentSearchesIfUnchanged(guest.raw);
        if (
          result === "changed" &&
          getAccountGeneration(userId) === current.generation
        ) {
          current.rerun = true;
        }
        if (result === "unavailable") {
          throw new Error("Guest recent searches could not be cleared after sync.");
        }
      }

      if (pending.canClear) {
        const result = clearPendingRecentSearchesIfUnchanged(
          userId,
          pending.raw,
        );
        if (
          result === "changed" &&
          getAccountGeneration(userId) === current.generation
        ) {
          current.rerun = true;
        }
        if (result === "unavailable") {
          throw new Error(
            "Pending recent searches could not be cleared after sync.",
          );
        }
      }
    } while (current.rerun);

    return remoteEntries;
  });
  current.promise = task;
  activeSyncs.set(userId, current);
  void task.then(
    () => {
      if (activeSyncs.get(userId) === current) activeSyncs.delete(userId);
    },
    () => {
      if (activeSyncs.get(userId) === current) activeSyncs.delete(userId);
    },
  );
  return task;
}
