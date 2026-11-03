import type { RouteMapSearchResult } from "./routeMap";

export type RecentSearchKind = "route" | "stop" | "terminal";

export interface RecentSearch {
  kind: RecentSearchKind;
  targetId: number;
  name: string;
  searchedAt: number;
}

export type RecentSearchSelectionSource = "search" | "restore";

const storageKey = "qroute_recent_searches";
const maxHistorySize = 25;
const maxHistoryAgeMs = 30 * 24 * 60 * 60 * 1000;

interface StoredHistory {
  raw: string | null;
  entries: unknown[];
  canWrite: boolean;
}

export interface RecentSearchHistorySnapshot {
  entries: RecentSearch[];
  raw: string | null;
  canClear: boolean;
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

function warnStorageFailure(action: string, error: unknown): void {
  console.warn(`Could not ${action} recent searches in localStorage.`, error);
}

function readStoredHistory(): StoredHistory {
  let raw: string | null;

  try {
    raw = localStorage.getItem(storageKey);
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

export function normalizeRecentSearchHistory(
  entries: unknown[],
  now = Date.now(),
): RecentSearch[] {
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
  entries: RecentSearch[]
): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
    return true;
  } catch (error) {
    warnStorageFailure("write", error);
    return false;
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

export function getRecentSearches(): RecentSearch[] {
  const stored = readStoredHistory();
  const history = normalizeRecentSearchHistory(stored.entries, Date.now());
  const serialized = JSON.stringify(history);

  if (
    stored.canWrite &&
    stored.raw !== null &&
    stored.raw !== serialized
  ) {
    writeHistory(history);
  }

  return history;
}

export function getRecentSearchesSnapshot(
  now = Date.now(),
): RecentSearchHistorySnapshot {
  const stored = readStoredHistory();
  const entries = normalizeRecentSearchHistory(stored.entries, now);
  const serialized = JSON.stringify(entries);
  let raw = stored.raw;

  if (
    stored.canWrite &&
    stored.raw !== null &&
    stored.raw !== serialized &&
    writeHistory(entries)
  ) {
    raw = serialized;
  }

  return { entries, raw, canClear: stored.canWrite };
}

export type ClearRecentSearchSnapshotResult =
  | "cleared"
  | "changed"
  | "unavailable";

export function clearRecentSearchesIfUnchanged(
  expectedRaw: string | null,
): ClearRecentSearchSnapshotResult {
  let current: string | null;
  try {
    current = localStorage.getItem(storageKey);
  } catch (error) {
    warnStorageFailure("read", error);
    return "unavailable";
  }

  if (current !== expectedRaw) return "changed";

  try {
    localStorage.removeItem(storageKey);
    return "cleared";
  } catch (error) {
    warnStorageFailure("clear", error);
    return "unavailable";
  }
}

export function recordRecentSearch(
  item: Pick<RecentSearch, "kind" | "targetId" | "name">
): RecentSearch[] {
  const history = getRecentSearches();
  if (!isRecentSearchItem(item)) {
    console.warn("Ignoring invalid recent search item.");
    return history;
  }

  const next = normalizeRecentSearchHistory(
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

  writeHistory(next);
  return next;
}

export function recordRecentSearchSelection(
  result: RouteMapSearchResult,
  source: RecentSearchSelectionSource
): void {
  if (source !== "search") return;

  recordRecentSearch(getRecentSearchItem(result));
}

export function removeRecentSearch(
  kind: RecentSearchKind,
  targetId: number
): RecentSearch[] {
  const next = getRecentSearches().filter(
    (entry) => entry.kind !== kind || entry.targetId !== targetId
  );

  writeHistory(next);
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    warnStorageFailure("clear", error);
  }
}
