import type { RouteMapSearchResult } from "./routeMap";

export type RecentSearchKind = "route" | "stop" | "terminal";

export interface RecentSearch {
  kind: RecentSearchKind;
  targetId: number;
  name: string;
  searchedAt: number;
}

export type RecentSearchSelectionSource = "search" | "restore";

const storageKeyPrefix = "qroute_recent_searches_v1";
const maxHistorySize = 100;
const maxHistoryAgeMs = 30 * 24 * 60 * 60 * 1000;

interface StoredHistory {
  raw: string | null;
  entries: unknown[];
  canWrite: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecentSearchKind(value: unknown): value is RecentSearchKind {
  return value === "route" || value === "stop" || value === "terminal";
}

function isRecentSearchItem(
  value: unknown
): value is Pick<RecentSearch, "kind" | "targetId" | "name"> {
  return (
    isRecord(value) &&
    isRecentSearchKind(value.kind) &&
    typeof value.targetId === "number" &&
    Number.isSafeInteger(value.targetId) &&
    value.targetId > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0
  );
}

function getStorageKey(userId: string | null): string {
  const owner = userId === null
    ? "anonymous"
    : `user:${encodeURIComponent(userId)}`;
  return `${storageKeyPrefix}:${owner}`;
}

function warnStorageFailure(action: string, error: unknown): void {
  console.warn(`Could not ${action} recent searches in localStorage.`, error);
}

function readStoredHistory(userId: string | null): StoredHistory {
  let raw: string | null;

  try {
    raw = localStorage.getItem(getStorageKey(userId));
  } catch (error) {
    warnStorageFailure("read", error);
    return { raw: null, entries: [], canWrite: false };
  }

  if (raw === null) return { raw, entries: [], canWrite: true };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("Ignoring malformed recent search history.");
      return { raw, entries: [], canWrite: true };
    }

    return { raw, entries: parsed, canWrite: true };
  } catch (error) {
    warnStorageFailure("parse", error);
    return { raw, entries: [], canWrite: true };
  }
}

function parseStoredEntry(value: unknown, now: number): RecentSearch | null {
  if (!isRecord(value)) return null;

  const searchedAt = value.searchedAt;
  if (
    !isRecentSearchItem(value) ||
    typeof searchedAt !== "number" ||
    !Number.isSafeInteger(searchedAt) ||
    searchedAt > now ||
    now - searchedAt > maxHistoryAgeMs
  ) {
    return null;
  }

  return {
    kind: value.kind,
    targetId: value.targetId,
    name: value.name.trim(),
    searchedAt,
  };
}

function normalizeHistory(entries: unknown[], now: number): RecentSearch[] {
  const seen = new Set<string>();

  return entries
    .map((entry) => parseStoredEntry(entry, now))
    .filter((entry): entry is RecentSearch => entry !== null)
    .sort((left, right) => right.searchedAt - left.searchedAt)
    .filter((entry) => {
      const key = `${entry.kind}:${entry.targetId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxHistorySize);
}

function writeHistory(
  userId: string | null,
  entries: RecentSearch[]
): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(entries));
  } catch (error) {
    warnStorageFailure("write", error);
  }
}

export function getRecentSearchItem(
  result: RouteMapSearchResult
): Pick<RecentSearch, "kind" | "targetId" | "name"> {
  return result.kind === "route"
    ? {
        kind: "route",
        targetId: result.route.id,
        name: result.route.name,
      }
    : {
        kind: result.point.kind,
        targetId: result.point.ref_id,
        name: result.point.name,
      };
}

export function getRecentSearches(userId: string | null): RecentSearch[] {
  const stored = readStoredHistory(userId);
  const history = normalizeHistory(stored.entries, Date.now());
  const serialized = JSON.stringify(history);

  if (
    stored.canWrite &&
    stored.raw !== null &&
    stored.raw !== serialized
  ) {
    writeHistory(userId, history);
  }

  return history;
}

export function recordRecentSearch(
  userId: string | null,
  item: Pick<RecentSearch, "kind" | "targetId" | "name">
): RecentSearch[] {
  const history = getRecentSearches(userId);
  if (!isRecentSearchItem(item)) {
    console.warn("Ignoring invalid recent search item.");
    return history;
  }

  const next = normalizeHistory(
    [
      {
        ...item,
        name: item.name.trim(),
        searchedAt: Date.now(),
      },
      ...history.filter(
        (entry) =>
          entry.kind !== item.kind || entry.targetId !== item.targetId
      ),
    ],
    Date.now()
  );

  writeHistory(userId, next);
  return next;
}

export function recordRecentSearchSelection(
  userId: string | null | undefined,
  result: RouteMapSearchResult,
  source: RecentSearchSelectionSource
): void {
  if (source !== "search" || userId === undefined) return;

  recordRecentSearch(userId, getRecentSearchItem(result));
}

export function removeRecentSearch(
  userId: string | null,
  kind: RecentSearchKind,
  targetId: number
): RecentSearch[] {
  const next = getRecentSearches(userId).filter(
    (entry) => entry.kind !== kind || entry.targetId !== targetId
  );

  writeHistory(userId, next);
  return next;
}

export function clearRecentSearches(userId: string | null): void {
  try {
    localStorage.removeItem(getStorageKey(userId));
  } catch (error) {
    warnStorageFailure("clear", error);
  }
}
